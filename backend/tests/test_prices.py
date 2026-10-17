import json
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest

from app.core.db import SessionLocal
from app.models import MarketPrice
from app.routers import prices
from tests.conftest import make_client, register

# Shape of an AGMARKNET record as published (lower-case keys, dd/mm/yyyy dates, prices as strings).
RECORDS = [
    {"state": "Delhi", "district": "North Delhi", "market": "Azadpur", "commodity": "Tomato", "variety": "Local",
     "grade": "FAQ", "arrival_date": "16/10/2026", "min_price": "1200", "max_price": "1800", "modal_price": "1500"},
    {"State": "Punjab", "District": "Ludhiana", "Market": "Khanna", "Commodity": "Tomato", "Variety": "Hybrid",
     "Arrival_Date": "16/10/2026", "Min_x0020_Price": "1,100", "Max_x0020_Price": "1,500", "Modal_x0020_Price": "1,300"},
    {"state": "Delhi", "market": "Azadpur", "commodity": "Tomato", "arrival_date": "not a date",
     "min_price": "1", "max_price": "2", "modal_price": "1"},  # unusable date: dropped, not guessed
    {"state": "Delhi", "market": "Azadpur", "commodity": "Onion", "arrival_date": "16/10/2026",
     "min_price": "900", "max_price": "1100", "modal_price": "1000"},  # other commodity the API might mix in
]


@pytest.fixture
def client():
    c = make_client()
    register(c)
    return c


@pytest.fixture
def key(settings):
    settings.DATAGOV_API_KEY = "test-datagov-key"
    return settings


def fake_api(monkeypatch, records=RECORDS, status=200, calls=None):
    def get(url, params, timeout):
        if calls is not None:
            calls.append(params)
        return httpx.Response(status, content=json.dumps({"records": records}),
                              request=httpx.Request("GET", url))
    monkeypatch.setattr(prices.httpx, "get", get)


def add_demo(commodity="Tomato"):
    with SessionLocal() as db:
        db.add(MarketPrice(commodity=commodity, variety="", state="Delhi", district="North Delhi", market="Azadpur",
                           arrival_date=date.today(), min_price=1, max_price=3, modal_price=2,
                           source="KisanSetu demo data", is_demo=True))
        db.commit()


def test_parser_handles_agmarknet_spellings_and_drops_bad_rows():
    rows = prices.parse_records(RECORDS)
    assert [(r["market"], r["modal_price"], r["arrival_date"]) for r in rows[:2]] == [
        ("Azadpur", 1500, date(2026, 10, 16)), ("Khanna", 1300, date(2026, 10, 16))]
    assert len(rows) == 3 and all(r["is_demo"] is False and r["unit"] == "Rs/quintal" for r in rows)


def test_without_key_serves_labelled_demo_and_never_calls_api(client, monkeypatch):
    calls = []
    fake_api(monkeypatch, calls=calls)
    add_demo()
    out = client.get("/market/prices?commodity=tomato").json()
    assert calls == []
    assert out["meta"]["source_status"] == "demo" and out["meta"]["live_configured"] is False
    assert all(r["is_demo"] for r in out["rows"])


def test_nothing_on_record_says_none(client):
    out = client.get("/market/prices?commodity=Wheat").json()
    assert out["meta"]["source_status"] == "none" and out["rows"] == []


def test_live_fetch_stores_real_rows_and_prefers_them_over_demo(client, key, monkeypatch):
    calls = []
    fake_api(monkeypatch, calls=calls)
    add_demo()
    out = client.get("/market/prices?commodity=Tomato").json()
    assert out["meta"]["source_status"] == "live"
    assert sorted(r["market"] for r in out["rows"]) == ["Azadpur", "Khanna"]  # Onion row filtered out
    assert not any(r["is_demo"] for r in out["rows"]) and out["rows"][0]["source"] == "data.gov.in (AGMARKNET)"
    assert calls[0]["filters[commodity]"] == "Tomato" and calls[0]["api-key"] == "test-datagov-key"
    assert "test-datagov-key" not in json.dumps(out)

    again = client.get("/market/prices?commodity=Tomato").json()
    assert len(calls) == 1 and again["meta"]["source_status"] == "cached"  # within the cache window
    assert len(again["rows"]) == 2  # upsert, no duplicates


def test_failed_fetch_falls_back_to_cached_rows(client, key, monkeypatch):
    fake_api(monkeypatch)
    client.get("/market/prices?commodity=Tomato")
    with SessionLocal() as db:  # pretend the cache expired
        for p in db.query(MarketPrice):
            p.fetched_at = datetime.now(UTC) - timedelta(hours=7)
        db.commit()
    fake_api(monkeypatch, status=503)
    out = client.get("/market/prices?commodity=Tomato").json()
    assert out["meta"]["source_status"] == "cached" and len(out["rows"]) == 2


def test_old_prices_are_flagged_stale(client):
    with SessionLocal() as db:
        db.add(MarketPrice(commodity="Potato", variety="", state="Delhi", district="North Delhi", market="Azadpur",
                           arrival_date=date.today() - timedelta(days=10), min_price=1, max_price=2, modal_price=1,
                           source="data.gov.in (AGMARKNET)", is_demo=False))
        db.commit()
    row = client.get("/market/prices?commodity=Potato").json()["rows"][0]
    assert row["stale"] is True


def test_filters_and_auth(client, key, monkeypatch):
    calls = []
    fake_api(monkeypatch, calls=calls)
    assert [r["market"] for r in client.get("/market/prices?commodity=Tomato&state=Punjab").json()["rows"]] == ["Khanna"]
    # One all-India fetch serves every state within the cache window.
    assert [r["market"] for r in client.get("/market/prices?commodity=Tomato&state=Delhi").json()["rows"]] == ["Azadpur"]
    assert len(calls) == 1 and "filters[state]" not in calls[0]
    assert client.get("/market/commodities").json()[:3] == ["Tomato", "Potato", "Maize"]
    assert make_client().get("/market/prices?commodity=Tomato").status_code == 401
