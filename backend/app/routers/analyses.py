"""Leaf-image disease analysis (plan §8.3). The analysis row is immutable: there is no update route."""

import hashlib
import io
from datetime import UTC, datetime, timedelta
from uuid import UUID

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from PIL import Image as PILImage
from PIL import ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.assistant import report as report_builder
from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import require_role
from app.ml import inference
from app.models import Analysis, FarmCrop, Image, Reminder, Report, User

router = APIRouter(tags=["analyses"])
farmer = require_role("farmer")

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SIDE_PX = 4096
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
PILImage.MAX_IMAGE_PIXELS = MAX_SIDE_PX * MAX_SIDE_PX  # decompression-bomb guard


def clean_image(raw: bytes) -> bytes:
    """Decode to prove it's an image, then re-encode as JPEG. Re-encoding drops EXIF, including GPS."""
    try:
        img = PILImage.open(io.BytesIO(raw))
        fmt = img.format
        if fmt not in ALLOWED_FORMATS:
            raise AppError(415, "Upload a JPEG, PNG or WebP photo")
        if max(img.size) > MAX_SIDE_PX:
            raise AppError(413, f"Photo is too large (max {MAX_SIDE_PX} px per side)")
        img.load()
        img = ImageOps.exif_transpose(img).convert("RGB")  # keep phone photos upright before EXIF is dropped
    except (UnidentifiedImageError, OSError, PILImage.DecompressionBombError, SyntaxError):
        raise AppError(415, "Upload a JPEG, PNG or WebP photo")
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()


class AnalysisOut(BaseModel):
    id: UUID
    status: inference.Status
    crop_code_claimed: str
    farm_crop_id: UUID | None
    prediction: inference.Prediction | None
    confidence: float | None
    top_k: list[inference.TopK]
    quality: inference.Quality
    policy: inference.Policy
    model: inference.ModelInfo
    message_key: str
    latency_ms: int
    created_at: datetime


def to_out(a: Analysis) -> AnalysisOut:
    by_code = {c["code"]: c for c in inference.labels()}
    label = by_code.get(a.predicted_class)
    top_k = [inference.TopK(class_code=t["class_code"], p=t["p"],
                            name=by_code.get(t["class_code"], {}).get("name_en"),
                            name_hi=by_code.get(t["class_code"], {}).get("name_hi")) for t in a.top_k]
    prediction = None
    if a.predicted_class:
        prediction = inference.Prediction(
            class_code=a.predicted_class,
            crop_code=label["crop_code"] if label else a.crop_code_claimed,
            name=label["name_en"] if label else a.predicted_class,
            name_hi=label["name_hi"] if label else a.predicted_class,
            is_healthy=label["is_healthy"] if label else False,
        )
    return AnalysisOut(
        id=a.id, status=a.status, crop_code_claimed=a.crop_code_claimed, farm_crop_id=a.farm_crop_id,
        prediction=prediction, confidence=a.confidence, top_k=top_k, quality=a.quality, policy=a.policy,
        model=inference.ModelInfo(version=a.model_version, provenance=a.model_provenance),
        message_key=f"diagnosis.{a.status}", latency_ms=a.latency_ms, created_at=a.created_at,
    )


@router.post("/analyses", status_code=201, response_model=AnalysisOut)
def create_analysis(
    image: UploadFile = File(...),
    crop_code: str = Form(..., min_length=1, max_length=30),
    farm_crop_id: UUID | None = Form(None),
    user: User = Depends(farmer),
    db: Session = Depends(get_db),
):
    if not inference.is_ready():
        raise AppError(503, "The disease model is not available right now")
    if farm_crop_id:
        crop = db.get(FarmCrop, farm_crop_id)
        if crop is None or crop.farmer_id != user.id:
            raise AppError(404, "Crop not found")

    raw = image.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise AppError(413, "Photo is too large (max 5 MB)")
    jpeg = clean_image(raw)

    result = inference.predict(jpeg, crop_code)
    stored = Image(owner_id=user.id, mime="image/jpeg", data=jpeg, sha256=hashlib.sha256(jpeg).hexdigest())
    db.add(stored)
    db.flush()
    analysis = Analysis(
        farmer_id=user.id, image_id=stored.id, farm_crop_id=farm_crop_id, crop_code_claimed=crop_code,
        status=result.status,
        predicted_class=result.prediction.class_code if result.prediction else None,
        confidence=result.confidence, top_k=[t.model_dump(include={"class_code", "p"}) for t in result.top_k],
        quality=result.quality.model_dump(), policy=result.policy.model_dump(),
        model_version=result.model.version, model_provenance=result.model.provenance,
        latency_ms=result.latency_ms,
    )
    db.add(analysis)
    # A diseased or unclear result gets an automatic re-check reminder in 7 days (plan §13.3).
    needs_recheck = result.status == "uncertain" or (
        result.status == "ok" and result.prediction and not result.prediction.is_healthy)
    if needs_recheck:
        db.add(Reminder(user_id=user.id, farm_crop_id=farm_crop_id, source="system",
                        title=f"Re-check {crop_code} leaf", due_at=datetime.now(UTC) + timedelta(days=7)))
    db.commit()
    return to_out(analysis)


def owned_analysis(db: Session, analysis_id: UUID, user: User) -> Analysis:
    analysis = db.get(Analysis, analysis_id)
    if analysis is None or analysis.farmer_id != user.id:
        raise AppError(404, "Analysis not found")
    return analysis


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: UUID, user: User = Depends(farmer), db: Session = Depends(get_db)):
    return to_out(owned_analysis(db, analysis_id, user))


@router.get("/me/analyses", response_model=list[AnalysisOut])
def my_analyses(limit: int = 20, user: User = Depends(farmer), db: Session = Depends(get_db)):
    q = (select(Analysis).where(Analysis.farmer_id == user.id)
         .order_by(Analysis.created_at.desc()).limit(min(max(limit, 1), 100)))
    return [to_out(a) for a in db.scalars(q)]


class ReportIn(BaseModel):
    language: Literal["en", "hi"]


class ReportOut(BaseModel):
    id: UUID
    analysis_id: UUID
    language: str
    content: dict
    evidence: list
    llm_status: str
    llm_model: str | None
    created_at: datetime


def _report_out(r: Report) -> ReportOut:
    return ReportOut(id=r.id, analysis_id=r.analysis_id, language=r.language, content=r.content,
                     evidence=r.evidence, llm_status=r.llm_status, llm_model=r.llm_model, created_at=r.created_at)


def _existing_report(db: Session, analysis_id: UUID, language: str) -> Report | None:
    return db.scalar(select(Report).where(Report.analysis_id == analysis_id, Report.language == language))


@router.post("/analyses/{analysis_id}/report", status_code=201, response_model=ReportOut)
def create_report(analysis_id: UUID, body: ReportIn, response: Response, user: User = Depends(farmer),
                  db: Session = Depends(get_db)):
    """Idempotent per (analysis, language): an existing report is returned with 200 (plan §8.4)."""
    analysis = owned_analysis(db, analysis_id, user)
    existing = _existing_report(db, analysis.id, body.language)
    if existing:
        response.status_code = 200
        return _report_out(existing)
    report = Report(analysis_id=analysis.id, language=body.language,
                    **report_builder.build(db, analysis, body.language))
    db.add(report)
    try:
        db.commit()
    except IntegrityError:  # the same report was generated concurrently
        db.rollback()
        response.status_code = 200
        return _report_out(_existing_report(db, analysis.id, body.language))
    return _report_out(report)


@router.get("/analyses/{analysis_id}/report", response_model=ReportOut)
def get_report(analysis_id: UUID, language: Literal["en", "hi"], user: User = Depends(farmer),
               db: Session = Depends(get_db)):
    analysis = owned_analysis(db, analysis_id, user)
    report = _existing_report(db, analysis.id, language)
    if report is None:
        raise AppError(404, "No report yet for this language")
    return _report_out(report)
