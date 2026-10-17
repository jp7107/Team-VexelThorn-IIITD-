"""HTTP middleware: request ids, access logging, CORS is configured in main."""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.request_context import request_id_var, resolve_request_id

logger = logging.getLogger("app.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign a request id, expose it to handlers, echo it back, log safely.

    Never logs headers, bodies, query strings, passwords, or tokens.
    """

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        request_id = resolve_request_id(request)
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
                request.method,
                request.url.path,
                status_code,
                duration_ms,
                request_id,
            )
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response
