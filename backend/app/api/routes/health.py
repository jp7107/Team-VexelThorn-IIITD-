"""Health check. Reports real dependency status; never claims an unchecked component is up."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.config import get_settings
from app.db import check_database
from app.ml import stub

router = APIRouter(tags=["ops"])


@router.get("/healthz", summary="Liveness and dependency status")
def healthz(response: Response) -> dict[str, object]:
    settings = get_settings()
    database = check_database()

    llm_configured = bool(settings.llm_api_key and settings.llm_api_key.get_secret_value())
    components: dict[str, object] = {
        "database": database,
        # Honest by construction: there is no model in P1a. `stub` here means
        # the contract adapter is present and the real artifact is missing.
        "model": {"status": "stub", "model_version": stub.MODEL_VERSION},
        "llm": {"status": "configured" if llm_configured else "not_configured"},
    }

    healthy = database.get("status") == "up"
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if healthy else "degraded",
        "components": components,
        "version": settings.app_version,
        "environment": settings.environment,
    }
