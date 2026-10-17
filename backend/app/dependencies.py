"""FastAPI dependencies: DB session, auth, model singletons."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.security import decode_token
from backend.db.models import User
from backend.db.session import get_db

_bearer = HTTPBearer(auto_error=False)

# ---- model singletons (loaded once) ----
_pipeline = None
_whisper = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from ml.inference.pipeline import DiagnosisPipeline

        _pipeline = DiagnosisPipeline(device=settings.device)
    return _pipeline


def get_whisper():
    global _whisper
    if _whisper is None:
        from ml.models.whisper_asr import WhisperASR

        _whisper = WhisperASR(model_size="small", compute_type="int8", device=settings.device)
    return _whisper


def _user_from_credentials(creds, db) -> User | None:
    if creds is None:
        return None
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        return None
    return db.get(User, int(payload["sub"]))


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    user = _user_from_credentials(creds, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    return _user_from_credentials(creds, db)


__all__ = ["get_pipeline", "get_whisper", "get_current_user", "get_optional_user"]
