"""Password hashing, session cookie (JWT) and role guards (plan T-6, §8.1)."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.models import User

COOKIE = "session"
_hasher = PasswordHasher()
# Verifying against a dummy hash keeps login timing similar for unknown phones.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def set_session(response: Response, user: User) -> None:
    s = get_settings()
    exp = datetime.now(UTC) + timedelta(hours=s.JWT_TTL_HOURS)
    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, s.JWT_SECRET, algorithm="HS256")
    response.set_cookie(COOKIE, token, max_age=s.JWT_TTL_HOURS * 3600, httponly=True,
                        secure=s.COOKIE_SECURE, samesite="lax", path="/")


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise AppError(401, "Not logged in")
    try:
        claims = jwt.decode(token, get_settings().JWT_SECRET, algorithms=["HS256"])
        user = db.get(User, UUID(claims["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise AppError(401, "Session invalid or expired")
    if user is None:
        raise AppError(401, "Session invalid or expired")
    if not user.is_active:
        raise AppError(403, "This account has been blocked. Contact support.", code="ACCOUNT_BLOCKED")
    return user


def require_role(*roles: str):
    def guard(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise AppError(403, "Not allowed for this role")
        return user
    return guard
