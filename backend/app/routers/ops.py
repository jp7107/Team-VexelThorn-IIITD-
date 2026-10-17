from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.assistant import llm
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
    info = inference.model_info()
    return {
        "db": db_status,
        "model": {"loaded": info is not None, **(info.model_dump() if info else {})},
        "llm_configured": llm.configured(),
    }
