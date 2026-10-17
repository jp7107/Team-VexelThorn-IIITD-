"""One error shape everywhere (IMPLEMENTATION_PLAN.md §14.1, §19.1).

Every failure - application, validation, transport, or unexpected - is rendered
as `{"error": {"code", "message", "field", "request_id"}}`. No exception text,
SQL fragment, or stack trace is ever returned to a client.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.request_context import get_request_id

logger = logging.getLogger(__name__)


class AppError(Exception):
    """An expected, user-facing failure with a stable machine-readable code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        field: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        self.headers = headers or {}


class AuthError(AppError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(401, code, message, headers={"WWW-Authenticate": "Bearer"})


class ForbiddenError(AppError):
    def __init__(self, code: str = "FORBIDDEN", message: str = "You are not allowed to do that.") -> None:
        super().__init__(403, code, message)


class NotFoundError(AppError):
    def __init__(self, code: str = "NOT_FOUND", message: str = "Not found.") -> None:
        super().__init__(404, code, message)


class ConflictError(AppError):
    def __init__(self, code: str, message: str, field: str | None = None) -> None:
        super().__init__(409, code, message, field=field)


class ValidationFailed(AppError):
    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(422, "VALIDATION_ERROR", message, field=field)


def error_body(exc: AppError) -> dict[str, Any]:
    return {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "field": exc.field,
            "request_id": get_request_id(),
        }
    }


_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


def _first_field(errors: list[dict[str, Any]]) -> str | None:
    """Turn Pydantic's ('body', 'phone') location into 'phone'."""
    for error in errors:
        loc = [str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path")]
        if loc:
            return ".".join(loc)
    return None


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc), headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        message = errors[0].get("msg", "Invalid request.") if errors else "Invalid request."
        app_error = ValidationFailed(str(message), field=_first_field(errors))
        return JSONResponse(status_code=422, content=error_body(app_error))

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "HTTP_ERROR")
        # Never echo framework detail text (it can contain internals).
        default_messages = {
            404: "Not found.",
            405: "Method not allowed.",
        }
        message = default_messages.get(exc.status_code, "Request failed.")
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(AppError(exc.status_code, code, message)),
            headers=getattr(exc, "headers", None) or None,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Log with the request id for correlation; return nothing internal.
        logger.exception("unhandled_exception request_id=%s", get_request_id())
        return JSONResponse(status_code=500, content=error_body(AppError(500, "INTERNAL_ERROR", "Something went wrong.")))
