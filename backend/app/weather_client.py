"""Open-Meteo weather client (plan section 11). No API key required.

Weather is an INFERENCE-CONTEXT feature only — it is not fed to the model,
because the dataset has no valid per-image location/time joins (plan 11.4).
"""
from __future__ import annotations

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def get_current_weather(lat: float, lon: float, timeout_s: float = 10.0) -> dict:
    """Return current weather context. Raises httpx.HTTPError on failure."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
    }
    with httpx.Client(timeout=timeout_s) as client:
        r = client.get(FORECAST_URL, params=params)
        r.raise_for_status()
        cur = r.json().get("current", {})
    return {
        "temperature": cur.get("temperature_2m"),
        "humidity": cur.get("relative_humidity_2m"),
        "rainfall": cur.get("precipitation"),
        "wind_speed": cur.get("wind_speed_10m"),
    }


__all__ = ["get_current_weather"]
