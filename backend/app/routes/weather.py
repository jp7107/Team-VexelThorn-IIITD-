"""Weather route (plan 23.4) — context only, never a model input."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from backend.app.schemas import WeatherOut
from backend.app.weather_client import get_current_weather

router = APIRouter(tags=["weather"])


@router.get("/weather", response_model=WeatherOut)
def weather(lat: float = Query(...), lon: float = Query(...)):
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid coordinates")
    try:
        return WeatherOut(**get_current_weather(lat, lon))
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Weather provider unavailable")
