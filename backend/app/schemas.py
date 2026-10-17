"""Pydantic request/response schemas (plan section 23)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---- auth ----
class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- diagnose ----
class TopKItem(BaseModel):
    class_: str = Field(alias="class")
    score: float
    model_config = ConfigDict(populate_by_name=True)


class WeatherOut(BaseModel):
    temperature: float | None = None
    humidity: float | None = None
    rainfall: float | None = None
    wind_speed: float | None = None


class DiagnoseResponse(BaseModel):
    prediction: str
    prediction_display: str
    confidence: float
    topk: list[dict]
    symptoms_text: str = ""
    weather: WeatherOut | None = None
    recommendations: list[str] = []
    low_confidence: bool = False
    ood: bool = False
    image_confidence: float | None = None
    message: str = ""
    disclaimer: str = ""
    model_version: str
    diagnosis_id: int | None = None


class TranscribeResponse(BaseModel):
    text: str
    language: str | None = None
    duration_s: float = 0.0


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    predicted_class: str
    confidence: float
    symptoms_text: str = ""
    created_at: datetime
    model_version: str


class HealthOut(BaseModel):
    status: str
    model_version: str
    active_model: str


__all__ = [
    "UserCreate", "LoginRequest", "UserOut", "Token",
    "TopKItem", "WeatherOut", "DiagnoseResponse", "TranscribeResponse",
    "HistoryItem", "HealthOut",
]
