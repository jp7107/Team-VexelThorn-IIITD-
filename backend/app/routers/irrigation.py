"""Irrigation estimate (plan §13.2; task AG-01). Always an estimate: no soil-moisture sensors are involved.

Method (FAO-56 single crop coefficient): crop water need ETc = Kc x ET0; net need over the forecast
= sum of max(0, ETc - 0.8 x rain). ET0 and rain come from the Open-Meteo daily forecast (no key needed).
"""

import logging
from datetime import date
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import require_role
from app.models import FarmCrop, User

log = logging.getLogger(__name__)
router = APIRouter(prefix="/irrigation", tags=["irrigation"])

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
FORECAST_DAYS = 7
EFFECTIVE_RAIN = 0.8  # ponytail: fixed share of rain counted as useful; FAO-56 effective-rainfall method later
LITRES_PER_MM_PER_ACRE = 4046.86  # 1 mm of water over 1 acre (4046.86 m2)

# FAO-56 Table 12 (Kc ini from the crop-group header, Kc mid, Kc end), checked 2026-10-17:
# https://www.fao.org/4/x0490e/x0490e0b.htm
KC = {
    "tomato": (0.60, 1.15, 0.80),  # Solanaceae group ini; end given as 0.70-0.90
    "potato": (0.50, 1.15, 0.75),  # Roots and tubers group ini
    "maize": (0.30, 1.20, 0.60),   # Cereals group ini; end 0.60 for harvest at high grain moisture (0.35 if dried)
}
SOURCES = [
    {"name": "FAO-56, Table 12 (crop coefficients)", "url": "https://www.fao.org/4/x0490e/x0490e0b.htm"},
    {"name": "Open-Meteo forecast (ET0, rain)", "url": "https://open-meteo.com/"},
]


def kc_for(crop_code: str, stage: str) -> float | None:
    """FAO-56 says Kc changes linearly through development and late season; we don't know how far into a stage
    the crop is, so those stages use the midpoint. ponytail: use sowing date + FAO Table 11 stage lengths later."""
    if crop_code not in KC:
        return None
    ini, mid, end = KC[crop_code]
    return {"initial": ini, "development": (ini + mid) / 2, "mid": mid, "late": (mid + end) / 2}[stage]


class Day(BaseModel):
    date: date
    et0_mm: float
    rain_mm: float
    crop_need_mm: float
    net_mm: float


class Totals(BaseModel):
    crop_need_mm: float
    rain_mm: float
    net_mm: float
    litres_for_field: int


class Estimate(BaseModel):
    crop_code: str
    stage: str
    kc: float
    area_acres: float
    location: dict
    weather_status: str  # "ok" | "unavailable"
    days: list[Day]
    totals: Totals | None
    method: str
    sources: list[dict]
    label: str = "estimate"


def forecast(lat: float, lon: float) -> list[tuple[date, float, float]]:
    r = httpx.get(OPEN_METEO, params={"latitude": lat, "longitude": lon, "timezone": "auto",
                                      "daily": "et0_fao_evapotranspiration,precipitation_sum",
                                      "forecast_days": FORECAST_DAYS}, timeout=8)
    r.raise_for_status()
    daily = r.json()["daily"]
    rows = zip(daily["time"], daily["et0_fao_evapotranspiration"], daily["precipitation_sum"], strict=True)
    # A missing value would silently become 0 mm of need; drop that day instead.
    return [(date.fromisoformat(d), float(e), float(p)) for d, e, p in rows if e is not None and p is not None]


@router.get("/estimate", response_model=Estimate)
def estimate(farm_crop_id: UUID, lat: float | None = Query(None, ge=-90, le=90),
             lon: float | None = Query(None, ge=-180, le=180),
             user: User = Depends(require_role("farmer")), db: Session = Depends(get_db)):
    crop = db.get(FarmCrop, farm_crop_id)
    if crop is None or crop.farmer_id != user.id:
        raise AppError(404, "Crop not found")
    kc = kc_for(crop.crop_code, crop.stage)
    if kc is None:
        raise AppError(422, "Water-need values exist for tomato, potato and maize only", code="CROP_NOT_SUPPORTED")
    if lat is None or lon is None:
        lat, lon = user.lat, user.lon
    if lat is None or lon is None:
        raise AppError(422, "A location is needed for the weather forecast", code="LOCATION_REQUIRED")
    lat, lon = round(lat, 2), round(lon, 2)  # ~1 km: enough for weather, less precise than the farm itself

    base = dict(crop_code=crop.crop_code, stage=crop.stage, kc=round(kc, 3), area_acres=float(crop.area_acres),
                location={"lat": lat, "lon": lon}, sources=SOURCES,
                method="FAO-56: crop need = Kc x ET0; net need = sum of max(0, crop need - 0.8 x rain)")
    try:
        weather = forecast(lat, lon)
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
        log.warning("weather forecast unavailable: %s", type(e).__name__)
        return Estimate(**base, weather_status="unavailable", days=[], totals=None)

    days = []
    for d, et0, rain in weather:
        need = kc * et0
        days.append(Day(date=d, et0_mm=round(et0, 2), rain_mm=round(rain, 2), crop_need_mm=round(need, 2),
                        net_mm=round(max(0.0, need - EFFECTIVE_RAIN * rain), 2)))
    net = sum(d.net_mm for d in days)
    totals = Totals(crop_need_mm=round(sum(d.crop_need_mm for d in days), 1), rain_mm=round(sum(d.rain_mm for d in days), 1),
                    net_mm=round(net, 1), litres_for_field=round(net * LITRES_PER_MM_PER_ACRE * float(crop.area_acres)))
    return Estimate(**base, weather_status="ok", days=days, totals=totals)
