"""History route (plan 23.5) — authenticated users' past diagnoses."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.dependencies import get_current_user
from backend.app.schemas import HistoryItem
from backend.db.models import Diagnosis, User
from backend.db.session import get_db

router = APIRouter(tags=["history"])


@router.get("/history", response_model=list[HistoryItem])
def history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.query(Diagnosis)
        .filter(Diagnosis.user_id == user.id)
        .order_by(Diagnosis.created_at.desc())
        .limit(100)
        .all()
    )
    return rows
