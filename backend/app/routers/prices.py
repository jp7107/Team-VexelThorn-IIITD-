"""Mandi prices (plan §14.2; tasks MKT-01, MKT-04).

Source: data.gov.in "Current Daily Price of Various Commodities from Various Markets (Mandi)" (AGMARKNET),
resource 9ef84268-d588-465a-a308-a864a43d0070. Needs a free key (DATAGOV_API_KEY, plan D-05).

Order of preference: live fetch (if older than CACHE_HOURS) -> cached real rows -> clearly labelled demo rows.
Prices are never estimated or interpolated; every row carries its date, source and is_demo flag.
"""

import logging
import re
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import current_user
from app.models import MarketPrice, User

log = logging.getLogger(__name__)
router = APIRouter(prefix="/market", tags=["prices"])

API = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
SOURCE = "data.gov.in (AGMARKNET)"
CACHE_HOURS = 6
STALE_DAYS = 7  # plan §21.3: older prices are flagged "may be outdated"
FETCH_TIMEOUT_S = 8
DEFAULT_COMMODITIES = ["Tomato", "Potato", "Maize"]


def _norm_key(key: str) -> str:
    # AGMARKNET exports spell fields differently ("Arrival_Date", "Min_x0020_Price", "min_price").
    return key.lower().replace("_x0020_", "_").replace(" ", "_")


def _date(value: str) -> date | None:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except (ValueError, AttributeError):
            continue
    return None


def _price(value) -> Decimal | None:
    try:
        p = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, AttributeError):
        return None
    return p if p >= 0 else None


def parse_records(records: list[dict]) -> list[dict]:
    """API records -> market_prices rows. Records with missing or invalid fields are dropped, never guessed."""
    rows = []
    for raw in records:
        r = {_norm_key(k): v for k, v in raw.items()}
        arrival = _date(r.get("arrival_date", ""))
        prices = [_price(r.get(k)) for k in ("min_price", "max_price", "modal_price")]
        text = {k: str(r.get(k) or "").strip() for k in ("commodity", "variety", "state", "district", "market")}
        if arrival is None or None in prices or not all(text[k] for k in ("commodity", "state", "market")):
            continue
        rows.append({**text, "district": text["district"] or text["market"], "arrival_date": arrival,
                     "min_price": prices[0], "max_price": prices[1], "modal_price": prices[2],
                     "unit": "Rs/quintal", "source": SOURCE, "is_demo": False})
    return rows


def fetch_live(commodity: str) -> list[dict]:
    """One all-India page for a commodity. Raises httpx errors on failure; callers fall back to cached rows.
    State/district filtering happens on stored rows, so the per-commodity cache window stays consistent."""
    params = {"api-key": get_settings().DATAGOV_API_KEY, "format": "json", "limit": "1000",
              "filters[commodity]": commodity}
    r = httpx.get(API, params=params, timeout=FETCH_TIMEOUT_S)
    r.raise_for_status()
    # Filter again here in case the API ignored the filter, so other commodities never slip in.
    return [x for x in parse_records(r.json().get("records", [])) if x["commodity"].lower() == commodity.lower()]


def store(db: Session, rows: list[dict]) -> int:
    for row in rows:
        stmt = insert(MarketPrice).values(**row, fetched_at=datetime.now(UTC))
        db.execute(stmt.on_conflict_do_update(
            constraint="one_price_per_market_day",
            set_={k: stmt.excluded[k] for k in ("min_price", "max_price", "modal_price", "state", "district",
                                                  "source", "is_demo", "fetched_at")}))
    db.commit()
    return len(rows)


class PriceRow(BaseModel):
    id: str
    commodity: str
    variety: str
    market: str
    district: str
    state: str
    arrival_date: date
    min_price: Decimal
    max_price: Decimal
    modal_price: Decimal
    unit: str
    source: str
    fetched_at: datetime
    is_demo: bool
    stale: bool


class PriceMeta(BaseModel):
    commodity: str
    source_status: Literal["live", "cached", "demo", "none"]
    last_fetch_at: datetime | None
    live_configured: bool


class PricesOut(BaseModel):
    meta: PriceMeta
    rows: list[PriceRow]


def _refresh_if_due(db: Session, commodity: str) -> str | None:
    """Returns "live" if a fetch succeeded now, "failed" if it was tried and failed, None if not needed."""
    if not get_settings().DATAGOV_API_KEY:
        return None
    last = db.scalar(select(func.max(MarketPrice.fetched_at)).where(
        func.lower(MarketPrice.commodity) == commodity.lower(), MarketPrice.is_demo.is_(False)))
    if last and datetime.now(UTC) - last < timedelta(hours=CACHE_HOURS):
        return None
    try:
        store(db, fetch_live(commodity))
        return "live"
    except (httpx.HTTPError, ValueError) as e:
        # The message never contains the API key: it's a query parameter, and we only log the error type/status.
        status = getattr(getattr(e, "response", None), "status_code", None)
        log.warning("mandi price fetch failed: %s %s", type(e).__name__, status or "")
        db.rollback()
        return "failed"


@router.get("/prices", response_model=PricesOut)
def prices(commodity: str = Query(..., min_length=1, max_length=60), state: str | None = Query(None, max_length=60),
           district: str | None = Query(None, max_length=60), limit: int = Query(30, ge=1, le=100),
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    commodity = re.sub(r"\s+", " ", commodity).strip()
    fetched = _refresh_if_due(db, commodity)

    def query(demo: bool):
        q = select(MarketPrice).where(func.lower(MarketPrice.commodity) == commodity.lower(),
                                      MarketPrice.is_demo.is_(demo))
        if state:
            q = q.where(func.lower(MarketPrice.state) == state.lower())
        if district:
            q = q.where(func.lower(MarketPrice.district) == district.lower())
        return list(db.scalars(q.order_by(MarketPrice.arrival_date.desc(), MarketPrice.market).limit(limit)))

    rows, status = query(False), "live" if fetched == "live" else "cached"
    if not rows:
        rows, status = query(True), "demo"
        if not rows:
            status = "none"
    today = datetime.now(UTC).date()
    return PricesOut(
        meta=PriceMeta(commodity=commodity, source_status=status,
                       last_fetch_at=max((r.fetched_at for r in rows), default=None),
                       live_configured=bool(get_settings().DATAGOV_API_KEY)),
        rows=[PriceRow(id=str(r.id), commodity=r.commodity, variety=r.variety, market=r.market, district=r.district,
                       state=r.state, arrival_date=r.arrival_date, min_price=r.min_price, max_price=r.max_price,
                       modal_price=r.modal_price, unit=r.unit, source=r.source, fetched_at=r.fetched_at,
                       is_demo=r.is_demo, stale=(today - r.arrival_date).days > STALE_DAYS) for r in rows],
    )


@router.get("/commodities", response_model=list[str])
def commodities(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Commodities with any stored price, plus the MVP crops first."""
    stored = sorted(set(db.scalars(select(MarketPrice.commodity).distinct())) - set(DEFAULT_COMMODITIES))
    return DEFAULT_COMMODITIES + stored
