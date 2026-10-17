from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.ml import inference

router = APIRouter(tags=["ops"])


@router.get("/healthz")
def healthz():
    return {"ok": True}


@router.get("/readyz")
def readyz(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {
        "db": db_status,
        "model": {"loaded": inference.is_ready(), **inference.model_info().model_dump()},
        "llm_configured": bool(get_settings().LLM_API_KEY),
    }
