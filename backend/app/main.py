"""FastAPI application entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, diagnoses, health
from app.config import get_settings
from app.db import check_database, dispose_engine
from app.errors import install_exception_handlers
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    # Boot-time dependency probe: log the truth, but do not crash the process -
    # /healthz must be reachable to report the outage.
    db = check_database()
    logger.info(
        "startup version=%s environment=%s database=%s model=stub",
        settings.app_version,
        settings.environment,
        db.get("status"),
    )
    try:
        yield
    finally:
        dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Kisan Mitra API. Phase P1a: auth, schema, health, and a labelled stub "
            "diagnosis contract. The ML model, assistant, and marketplace are not implemented."
        ),
        docs_url="/docs",
        openapi_url="/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )

    # Order matters: the request-id middleware must run inside CORS so that
    # error responses also carry CORS headers.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Idempotency-Key"],
        expose_headers=["X-Request-ID"],
    )

    install_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(diagnoses.router, prefix=API_PREFIX)

    return app


app = create_app()
