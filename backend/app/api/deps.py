"""Shared API dependencies: authentication and role enforcement.

The role in the JWT is a hint; the authoritative role is read from the database
on every request so a revoked or changed role takes effect immediately
(plan §14.1: "role in the token, re-checked server-side on every request").
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AuthError, ForbiddenError
from app.models import User
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False, scheme_name="BearerAuth")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    session: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise AuthError("MISSING_TOKEN", "Please sign in.")
    payload = decode_access_token(credentials.credentials)

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (TypeError, ValueError) as exc:
        raise AuthError("INVALID_TOKEN", "Please sign in again.") from exc

    user = session.get(User, user_id)
    if user is None:
        # A valid signature for a user that no longer exists.
        raise AuthError("INVALID_TOKEN", "Please sign in again.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str) -> Callable[[User], User]:
    """Return a dependency that admits only the listed roles."""

    def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ForbiddenError("ROLE_FORBIDDEN", "Your account cannot use this feature.")
        return user

    return dependency


FarmerUser = Annotated[User, Depends(require_roles("farmer"))]
AdminUser = Annotated[User, Depends(require_roles("admin"))]
