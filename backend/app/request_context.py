"""Request correlation id, stored per-request in a context variable."""

from __future__ import annotations

import contextvars
import re
import uuid

from starlette.requests import Request

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def get_request_id() -> str:
    return request_id_var.get()


def resolve_request_id(request: Request) -> str:
    """Echo a well-formed client id; otherwise generate one.

    Rejecting arbitrary header content keeps log lines free of injected text.
    """
    provided = request.headers.get("x-request-id", "")
    if _CLIENT_ID_PATTERN.fullmatch(provided):
        return provided
    return uuid.uuid4().hex
