import json

import httpx
import pytest

from app.routers import irrigation
from tests.conftest import make_client, register

WEATHER = {"daily": {"time": [f"2026-10-{d}" for d in range(17, 24)],
                     "et0_fao_evapotranspiration": [4.0] * 7,
                     "precipitation_sum": [0.0, 10.0, 0.0, 0.0, 0.0, 0.0, 0.0]}}


@pytest.fixture
def weather(monkeypatch):
    calls = []

    def get(url, params, timeout):
        calls.append(params)
        return httpx.Response(200, content=json.dumps(WEATHER), request=httpx.Request("GET", url))

    monkeypatch.setattr(irrigation.httpx, "get", get)
    return calls


def farmer_with_crop(crop="tomato", stage="mid", area="2"):
    c = make_client()
    register(c)
    crop_id = c.post("/me/crops", json={"crop_code": crop, "area_acres": area, "sowing_date": "2026-08-01",
                                        "stage": stage}).json()["id"]
    return c, crop_id


def test_kc_follows_fao56_with_stage_midpoints():
    assert irrigation.kc_for("tomato", "initial") == 0.60
    assert irrigation.kc_for("tomato", "mid") == 1.15
    assert irrigation.kc_for("tomato", "development") == pytest.approx(0.875)
    assert irrigation.kc_for("maize", "late") == pytest.approx(0.90)
    assert irrigation.kc_for("rice", "mid") is None


def test_estimate_uses_et0_kc_and_effective_rain(weather):
    c, crop_id = farmer_with_crop()
    r = c.get(f"/irrigation/estimate?farm_crop_id={crop_id}&lat=27.1767&lon=78.0081")
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["kc"] == 1.15 and e["weather_status"] == "ok" and e["label"] == "estimate"
    # Each day needs 1.15 x 4.0 = 4.6 mm; the rainy day's 0.8 x 10 mm covers it fully.
    assert [d["net_mm"] for d in e["days"]] == [4.6, 0.0, 4.6, 4.6, 4.6, 4.6, 4.6]
    assert e["totals"]["net_mm"] == 27.6
    assert e["totals"]["litres_for_field"] == round(27.6 * 4046.86 * 2)
    assert weather[0]["latitude"] == 27.18 and weather[0]["longitude"] == 78.01  # rounded before leaving us


def test_profile_location_is_used_and_missing_location_is_explained(weather):
    c, crop_id = farmer_with_crop()
    r = c.get(f"/irrigation/estimate?farm_crop_id={crop_id}")
    assert r.status_code == 422 and r.json()["error"]["code"] == "LOCATION_REQUIRED"
    c.patch("/me", json={"lat": 26.85, "lon": 80.95})
    assert c.get(f"/irrigation/estimate?farm_crop_id={crop_id}").json()["location"] == {"lat": 26.85, "lon": 80.95}


def test_unsupported_crop_and_other_farmers_crop(weather):
    c, crop_id = farmer_with_crop(crop="rice")
    r = c.get(f"/irrigation/estimate?farm_crop_id={crop_id}&lat=27&lon=78")
    assert r.status_code == 422 and r.json()["error"]["code"] == "CROP_NOT_SUPPORTED"
    other, _ = farmer_with_crop()
    assert other.get(f"/irrigation/estimate?farm_crop_id={crop_id}&lat=27&lon=78").status_code == 404
    assert weather == []  # nothing was fetched for refused requests


def test_weather_outage_is_reported_not_guessed(monkeypatch):
    def down(url, params, timeout):
        raise httpx.ConnectTimeout("down")

    monkeypatch.setattr(irrigation.httpx, "get", down)
    c, crop_id = farmer_with_crop()
    e = c.get(f"/irrigation/estimate?farm_crop_id={crop_id}&lat=27&lon=78").json()
    assert e["weather_status"] == "unavailable" and e["days"] == [] and e["totals"] is None
