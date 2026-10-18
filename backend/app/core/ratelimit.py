"""Sliding-window rate limits (plan §21.1, task BE-08).

ponytail: in-memory, per process. Fine for one backend instance; move the store to Redis when scaling out.
"""

import math
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, Request

from app.core.errors import AppError
from app.core.security import current_user
from app.models import User

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def hit(key: str, limit: int, window_s: int) -> None:
    """Records one request for `key`; raises 429 with Retry-After once `limit` requests fall in the window."""
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and q[0] <= now - window_s:
            q.popleft()
        if len(q) >= limit:
            retry = max(1, math.ceil(q[0] + window_s - now))
            raise AppError(429, "Too many requests. Please wait and try again.",
                           details={"retry_after_s": retry}, headers={"Retry-After": str(retry)})
        q.append(now)


def reset() -> None:
    with _lock:
        _hits.clear()


def client_ip(request: Request) -> str:
    # Behind the Next.js proxy and the host's load balancer the first X-Forwarded-For hop is the browser.
    # It can be spoofed when the API is called directly, so account-level limits never rely on it alone.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def per_ip(name: str, limit: int, window_s: int):
    def dep(request: Request) -> None:
        hit(f"{name}:ip:{client_ip(request)}", limit, window_s)
    return dep


def per_user(name: str, *rules: tuple[int, int]):
    """One or more (limit, window_s) rules, all keyed on the logged-in user."""
    def dep(user: User = Depends(current_user)) -> None:
        for limit, window_s in rules:
            hit(f"{name}:user:{user.id}:{window_s}", limit, window_s)
    return dep
