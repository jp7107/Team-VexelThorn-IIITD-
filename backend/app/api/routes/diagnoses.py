"""Diagnosis routes — the private farmer resource used by T-SEC-01.

P1a builds the contract and persistence with the stub adapter. Upload signing
(B-03), the real model (ML-06) and the explanation (LLM-01) are later phases.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession, FarmerUser
from app.errors import NotFoundError
from app.ml.stub import infer_stub
from app.models import Diagnosis, User
from app.schemas import CreateDiagnosisRequest, DiagnosisResult, PredictionOut

router = APIRouter(prefix="/diagnoses", tags=["diagnoses"])


def _to_result(row: Diagnosis) -> DiagnosisResult:
    prediction = None
    if row.status in ("confident", "uncertain") and row.label is not None:
        output = infer_stub(row.image_key, None)  # display fields only; label comes from the row
        prediction = PredictionOut(
            label=row.label,
            display_name=output.display_name or row.label,
            crop=row.crop or "",
            confidence=float(row.p_max or 0.0),
            margin=float(row.margin or 0.0),
            model_version=row.model_version,
            thresholds_version=row.thresholds_version,
        )
    return DiagnosisResult(
        id=row.id,
        created_at=row.created_at,
        image_key=row.image_key,
        status=row.status,  # type: ignore[arg-type]
        prediction=prediction,
        explanation=None,
    )


@router.post(
    "",
    response_model=DiagnosisResult,
    status_code=status.HTTP_201_CREATED,
    summary="Run the (stub) classifier on an uploaded image key",
)
def create_diagnosis(payload: CreateDiagnosisRequest, user: FarmerUser, session: DbSession) -> DiagnosisResult:
    output = infer_stub(payload.image_key, payload.crop_hint)
    row = Diagnosis(
        farmer_id=user.id,
        image_key=payload.image_key,
        label=output.label,
        crop=output.crop,
        status=output.status,
        p_max=output.p_max,
        margin=output.margin,
        model_version=output.model_version,
        thresholds_version=output.thresholds_version,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_result(row)


@router.get("", response_model=list[DiagnosisResult], summary="Own diagnoses, newest first")
def list_own_diagnoses(user: FarmerUser, session: DbSession, limit: int = 20) -> list[DiagnosisResult]:
    limit = max(1, min(limit, 100))
    rows = session.scalars(
        select(Diagnosis)
        .where(Diagnosis.farmer_id == user.id)
        .order_by(Diagnosis.created_at.desc())
        .limit(limit)
    ).all()
    return [_to_result(row) for row in rows]


def _load_authorized(session: Session, viewer: User, diagnosis_id: uuid.UUID) -> Diagnosis:
    row = session.get(Diagnosis, diagnosis_id)
    # A different owner's diagnosis is indistinguishable from a missing one.
    if row is None or (row.farmer_id != viewer.id and viewer.role != "admin"):
        raise NotFoundError("DIAGNOSIS_NOT_FOUND", "This diagnosis was not found.")
    return row


@router.get("/{diagnosis_id}", response_model=DiagnosisResult, summary="One own diagnosis")
def get_diagnosis(diagnosis_id: uuid.UUID, user: CurrentUser, session: DbSession) -> DiagnosisResult:
    return _to_result(_load_authorized(session, user, diagnosis_id))
