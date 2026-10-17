"""ORM models — IMPLEMENTATION_PLAN.md §14.6.

Constraints are named through the metadata convention so Alembic renders
stable, reviewable constraint names. Explanations live in their own table:
that makes "the LLM cannot overwrite the prediction" a schema fact (§9.3).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# §8.8: only these four are persisted. `invalid_image` and `unavailable` are
# transport outcomes and are returned as errors, never stored (G-04, Q-07).
DIAGNOSIS_STATUSES = ("confident", "uncertain", "unsupported", "unsupported_crop")


class Base(DeclarativeBase):
    metadata = None  # set below


from sqlalchemy import MetaData  # noqa: E402  (needed after Base to attach convention)

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
Base.metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    phone: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False, server_default="hi")
    village: Mapped[str | None] = mapped_column(Text)
    district: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(Text)
    is_new: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    crops: Mapped[list[FarmerCrop]] = relationship(back_populates="farmer", cascade="all, delete-orphan")
    diagnoses: Mapped[list[Diagnosis]] = relationship(back_populates="farmer")

    __table_args__ = (
        CheckConstraint("role IN ('farmer','customer','wholesaler','admin')", name="role_allowed"),
    )


class FarmerCrop(Base):
    __tablename__ = "farmer_crops"

    id: Mapped[uuid.UUID] = _uuid_pk()
    farmer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    crop: Mapped[str] = mapped_column(Text, nullable=False)
    sowing_date: Mapped[date | None] = mapped_column(Date)
    area_acres: Mapped[float | None] = mapped_column(Numeric(6, 2))
    stage: Mapped[str | None] = mapped_column(Text)
    soil_type: Mapped[str | None] = mapped_column(Text)

    farmer: Mapped[User] = relationship(back_populates="crops")

    __table_args__ = (
        # G-03: the plan gives no uniqueness rule. Created at most once per
        # (farmer, crop) so the profile cannot accumulate duplicates.
        UniqueConstraint("farmer_id", "crop", name="farmer_id_crop"),
    )


class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id: Mapped[uuid.UUID] = _uuid_pk()
    farmer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    image_key: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str | None] = mapped_column(Text)
    crop: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    p_max: Mapped[float | None] = mapped_column(Numeric(5, 4))
    margin: Mapped[float | None] = mapped_column(Numeric(5, 4))
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    thresholds_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    farmer: Mapped[User] = relationship(back_populates="diagnoses")
    explanation: Mapped[DiagnosisExplanation | None] = relationship(
        back_populates="diagnosis", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('confident','uncertain','unsupported','unsupported_crop')",
            name="status_allowed",
        ),
        # A confident/uncertain row must carry the label it claims.
        CheckConstraint(
            "status NOT IN ('confident','uncertain') OR (label IS NOT NULL AND p_max IS NOT NULL)",
            name="label_required_for_actionable_status",
        ),
        Index("ix_diagnoses_farmer_created", "farmer_id", created_at.desc()),
    )


class DiagnosisExplanation(Base):
    __tablename__ = "diagnosis_explanations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    diagnosis_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("diagnoses.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False)
    text_body: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    diagnosis: Mapped[Diagnosis] = relationship(back_populates="explanation")

    __table_args__ = (
        CheckConstraint("source IN ('llm','template_fallback')", name="source_allowed"),
    )


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = _uuid_pk()
    farmer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    crop: Mapped[str] = mapped_column(Text, nullable=False)
    variety: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    expected_price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default="INR")
    district: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(Text)
    photo_key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("expected_price IS NULL OR expected_price >= 0", name="price_non_negative"),
        CheckConstraint(
            "status IN ('draft','active','reserved','sold','paused','removed')",
            name="status_allowed",
        ),
        Index("ix_listings_status_crop_district", "status", "crop", "district"),
    )


class Enquiry(Base):
    __tablename__ = "enquiries"

    id: Mapped[uuid.UUID] = _uuid_pk()
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    quantity: Mapped[float | None] = mapped_column(Numeric(10, 2))
    message: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="sent")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("status IN ('sent','responded','closed')", name="status_allowed"),
    )


class PriceQuote(Base):
    __tablename__ = "price_quotes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    commodity: Mapped[str] = mapped_column(Text, nullable=False)
    market: Mapped[str | None] = mapped_column(Text)
    district: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[uuid.UUID] = _uuid_pk()
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    eligibility: Mapped[str | None] = mapped_column(Text)
    benefit: Mapped[str | None] = mapped_column(Text)
    apply_url: Mapped[str | None] = mapped_column(Text)
    lang: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    external_source: Mapped[str | None] = mapped_column(Text)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    search_tsv: Mapped[str | None] = mapped_column(TSVECTOR)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("kind IN ('scheme','update','factsheet','video')", name="kind_allowed"),
        Index("ix_content_items_search_tsv", "search_tsv", postgresql_using="gin"),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    tool: Mapped[str | None] = mapped_column(Text)
    args_hash: Mapped[str | None] = mapped_column(Text)
    row_ids: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    request_id: Mapped[str | None] = mapped_column(Text)
    guardrail_trip: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
