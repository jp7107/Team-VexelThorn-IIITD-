"""FastAPI application entrypoint (plan sections 19/23).

Loads models once at startup (plan 19.3). Mounts all routes under /api.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.dependencies import get_pipeline
from backend.app.routes import auth, diagnose, history, transcribe, weather
from backend.app.schemas import HealthOut
from backend.db.session import init_db

logger = logging.getLogger("cotton")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    os.makedirs(settings.upload_dir, exist_ok=True)
    try:
        get_pipeline()  # warm-load ViT + MiniLM + checkpoints once
        logger.info("Diagnosis pipeline loaded.")
    except FileNotFoundError:
        logger.warning("No trained checkpoint yet — /api/diagnose will error until models are trained.")
    yield


app = FastAPI(title="Cotton Disease, Pest & Condition Diagnosis API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, diagnose.router, transcribe.router, weather.router, history.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health", response_model=HealthOut, tags=["health"])
def health():
    try:
        pipe = get_pipeline()
        return HealthOut(status="ok", model_version=pipe.model_version, active_model=pipe.active_model)
    except FileNotFoundError:
        return HealthOut(status="degraded", model_version="none", active_model="none")


__all__ = ["app"]
