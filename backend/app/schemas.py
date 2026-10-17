"""Request/response schemas (Pydantic v2)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["farmer", "customer", "wholesaler", "admin"]
Language = Literal["en", "hi"]
DiagnosisStatus = Literal["confident", "uncertain", "unsupported", "unsupported_crop"]

# Accepted: 10-digit Indian mobile numbers, optionally prefixed with +91 / 91.
_PHONE_RE = re.compile(r"^(?:\+?91)?([6-9]\d{9})$")


def normalize_phone(value: str) -> str:
    digits = re.sub(r"[\s-]", "", value)
    match = _PHONE_RE.fullmatch(digits)
    if not match:
        raise ValueError("Enter a 10-digit mobile number.")
    return match.group(1)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RegisterRequest(_Strict):
    phone: str
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=120)
    role: Role = "farmer"
    lang: Language = "hi"
    village: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    crops: list[str] = Field(default_factory=list, max_length=20)

    _phone = field_validator("phone")(normalize_phone)

    @field_validator("crops")
    @classmethod
    def clean_crops(cls, value: list[str]) -> list[str]:
        cleaned = [crop.strip() for crop in value if crop.strip()]
        if any(len(crop) > 60 for crop in cleaned):
            raise ValueError("Crop names must be 60 characters or fewer.")
        # de-duplicate, order-preserving
        return list(dict.fromkeys(cleaned))


class LoginRequest(_Strict):
    phone: str
    password: str = Field(min_length=1, max_length=128)

    _phone = field_validator("phone")(normalize_phone)


class ProfileUpdate(_Strict):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    lang: Language | None = None
    email: EmailStr | None = None
    village: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone: str
    email: str | None
    name: str
    role: Role
    language: Language
    village: str | None
    district: str | None
    state: str | None
    is_new: bool
    created_at: datetime


class TokenOut(BaseModel):
    user: UserOut
    access_token: str


# --------------------------------------------------------------------------
# Diagnosis contract (IMPLEMENTATION_PLAN.md §14.3).
# Shape is frozen in P1b, not here. `prediction` is present iff status is
# confident/uncertain; `explanation` may be null in P1a (no LLM yet).
# --------------------------------------------------------------------------


class PredictionOut(BaseModel):
    label: str
    display_name: str
    crop: str
    confidence: float = Field(ge=0.0, le=1.0)
    margin: float = Field(ge=-1.0, le=1.0)
    model_version: str
    thresholds_version: str


class CitationOut(BaseModel):
    id: str
    source: str
    as_of: str


class ExplanationOut(BaseModel):
    source: Literal["llm", "template_fallback"]
    text: str
    language: Language
    citations: list[CitationOut] = Field(default_factory=list)


class DiagnosisResult(BaseModel):
    id: uuid.UUID
    created_at: datetime
    image_key: str
    status: DiagnosisStatus
    prediction: PredictionOut | None = None
    explanation: ExplanationOut | None = None
    disclaimer: str = (
        "Automated estimate. Confirm with a local expert before treatment."
    )


class CreateDiagnosisRequest(_Strict):
    image_key: str = Field(min_length=1, max_length=512)
    crop_hint: str | None = Field(default=None, max_length=60)


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


def envelope_example(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "field": None, "request_id": "…"}}
