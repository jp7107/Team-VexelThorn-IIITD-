"""ORM models (plan section 20): users, diagnoses, feedback."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    diagnoses: Mapped[list["Diagnosis"]] = relationship(back_populates="user")


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    image_path: Mapped[str] = mapped_column(String(500))
    predicted_class: Mapped[str] = mapped_column(String(60))
    confidence: Mapped[float] = mapped_column(Float)
    topk_json: Mapped[str] = mapped_column(Text, default="[]")
    symptoms_text: Mapped[str] = mapped_column(Text, default="")
    transcription_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    rainfall: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_source: Mapped[str | None] = mapped_column(String(60), nullable=True)
    model_version: Mapped[str] = mapped_column(String(60), default="cotton-mm-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User | None"] = relationship(back_populates="diagnoses")
    feedback: Mapped[list["Feedback"]] = relationship(back_populates="diagnosis")


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    diagnosis_id: Mapped[int] = mapped_column(ForeignKey("diagnoses.id"), index=True)
    correct_class: Mapped[str | None] = mapped_column(String(60), nullable=True)
    user_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    diagnosis: Mapped["Diagnosis"] = relationship(back_populates="feedback")


__all__ = ["User", "Diagnosis", "Feedback"]
