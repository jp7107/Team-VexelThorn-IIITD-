"""All tables from plan §7. Only migrations change the schema; see alembic/versions."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Computed, Date, DateTime, Enum, Float, ForeignKey, Index, Integer, LargeBinary,
    Numeric, SmallInteger, String, Text, UniqueConstraint, func, text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ROLES = ("farmer", "customer", "admin")
CUSTOMER_TYPES = ("retail", "wholesale")
LANGUAGES = ("en", "hi")
CROP_STAGES = ("initial", "development", "mid", "late")
ANALYSIS_STATUSES = ("ok", "uncertain", "unsupported", "rejected_quality", "error")
# "mock" exists so a stand-in model can never be shown as a real one (plan §17.2 CP4).
PROVENANCES = ("trained_in_house", "third_party_pretrained", "mock")
UNITS = ("kg", "quintal", "tonne", "dozen")
LISTING_STATUSES = ("open", "closed", "hidden")
ENQUIRY_STATUSES = ("pending", "accepted", "declined", "withdrawn")


def enum(name: str, *values: str) -> Enum:
    # VARCHAR + CHECK instead of native PG enums: adding a value later is a one-line migration.
    return Enum(*values, name=name, native_enum=False, create_constraint=True,
                length=max(30, *map(len, values)))


def pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def created() -> Mapped[datetime]:
    # Python-side default too, so the value is available right after commit without a refresh.
    return mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), server_default=func.now(),
                         nullable=False)


def user_fk(ondelete: str = "CASCADE", nullable: bool = False, index: bool = True):
    return mapped_column(ForeignKey("users.id", ondelete=ondelete), nullable=nullable, index=index)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("(role = 'customer') = (customer_type IS NOT NULL)", name="customer_type_iff_customer"),
    )
    id: Mapped[uuid.UUID] = pk()
    role: Mapped[str] = mapped_column(enum("user_role", *ROLES))
    customer_type: Mapped[str | None] = mapped_column(enum("customer_type", *CUSTOMER_TYPES))
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(15), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    language: Mapped[str] = mapped_column(enum("language", *LANGUAGES), server_default="en")
    state: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(60))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = created()


class Image(Base):
    __tablename__ = "images"
    id: Mapped[uuid.UUID] = pk()
    owner_id: Mapped[uuid.UUID] = user_fk()
    mime: Mapped[str] = mapped_column(String(30))
    # ponytail: images live in Postgres; move to object storage past ~10k images (plan T-5).
    data: Mapped[bytes] = mapped_column(LargeBinary)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = created()


class FarmCrop(Base):
    __tablename__ = "farm_crops"
    __table_args__ = (CheckConstraint("area_acres > 0", name="area_positive"),)
    id: Mapped[uuid.UUID] = pk()
    farmer_id: Mapped[uuid.UUID] = user_fk()
    crop_code: Mapped[str] = mapped_column(String(30))
    variety: Mapped[str | None] = mapped_column(String(60))
    area_acres: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    sowing_date: Mapped[date] = mapped_column(Date)
    stage: Mapped[str] = mapped_column(enum("crop_stage", *CROP_STAGES))
    soil_type: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = created()


class CropUpdate(Base):
    __tablename__ = "crop_updates"
    id: Mapped[uuid.UUID] = pk()
    farm_crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farm_crops.id", ondelete="CASCADE"), index=True)
    condition: Mapped[str] = mapped_column(enum("crop_condition", "good", "concern", "bad"))
    note: Mapped[str | None] = mapped_column(String(500))
    image_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created()


class Reminder(Base):
    __tablename__ = "reminders"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = user_fk()
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("farm_crops.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(120))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(enum("reminder_source", "user", "system"), server_default="user")
    created_at: Mapped[datetime] = created()


class DiseaseClass(Base):
    __tablename__ = "disease_classes"
    code: Mapped[str] = mapped_column(String(60), primary_key=True)
    crop_code: Mapped[str] = mapped_column(String(30), index=True)
    name_en: Mapped[str] = mapped_column(String(100))
    name_hi: Mapped[str] = mapped_column(String(100))
    is_healthy: Mapped[bool]


class MlModel(Base):
    __tablename__ = "ml_models"
    version: Mapped[str] = mapped_column(String(60), primary_key=True)
    arch: Mapped[str] = mapped_column(String(60))
    provenance: Mapped[str] = mapped_column(enum("model_provenance", *PROVENANCES))
    metrics: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    sha256: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[datetime] = created()


class Analysis(Base):
    """Immutable record of what the classifier said. No route updates it (plan §10.2)."""
    __tablename__ = "analyses"
    id: Mapped[uuid.UUID] = pk()
    farmer_id: Mapped[uuid.UUID] = user_fk()
    image_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"))
    farm_crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("farm_crops.id", ondelete="SET NULL"))
    crop_code_claimed: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(enum("analysis_status", *ANALYSIS_STATUSES))
    # No FK to disease_classes: the label set belongs to the model version, validated in app.ml.
    predicted_class: Mapped[str | None] = mapped_column(String(60))
    confidence: Mapped[float | None] = mapped_column(Float)
    top_k: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    quality: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    policy: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    model_version: Mapped[str] = mapped_column(String(60))
    model_provenance: Mapped[str] = mapped_column(enum("analysis_provenance", *PROVENANCES))
    latency_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = created()


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("analysis_id", "language", name="one_report_per_language"),)
    id: Mapped[uuid.UUID] = pk()
    analysis_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("analyses.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(enum("report_language", *LANGUAGES))
    content: Mapped[dict] = mapped_column(JSONB)
    evidence: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    llm_status: Mapped[str] = mapped_column(enum("llm_status", "ok", "fallback"))
    llm_model: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = created()


class KbArticle(Base):
    __tablename__ = "kb_articles"
    __table_args__ = (Index("ix_kb_articles_tsv", "tsv", postgresql_using="gin"),)
    id: Mapped[uuid.UUID] = pk()
    disease_class_code: Mapped[str | None] = mapped_column(String(60), index=True)
    crop_code: Mapped[str | None] = mapped_column(String(30))
    topic: Mapped[str] = mapped_column(enum("kb_topic", "disease", "productivity", "irrigation", "general"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(enum("kb_language", *LANGUAGES))
    source_name: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(String(500))
    verified_by: Mapped[str] = mapped_column(String(100))
    verified_at: Mapped[date] = mapped_column(Date)
    # 'simple' config: no English stemming, so Hindi text is tokenized the same way.
    tsv: Mapped[str] = mapped_column(TSVECTOR, Computed("to_tsvector('simple', title || ' ' || body)",
                                                        persisted=True))
    created_at: Mapped[datetime] = created()


class Scheme(Base):
    __tablename__ = "schemes"
    id: Mapped[uuid.UUID] = pk()
    name: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    eligibility_text: Mapped[str] = mapped_column(Text)
    benefit_text: Mapped[str | None] = mapped_column(Text)
    official_url: Mapped[str] = mapped_column(String(500))
    states: Mapped[list[str]] = mapped_column(ARRAY(String(60)), server_default=text("'{}'"))
    last_verified_at: Mapped[date] = mapped_column(Date)
    published: Mapped[bool] = mapped_column(server_default=text("false"))
    created_at: Mapped[datetime] = created()


class Update(Base):
    __tablename__ = "updates"
    id: Mapped[uuid.UUID] = pk()
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))
    author_id: Mapped[uuid.UUID | None] = user_fk(ondelete="SET NULL", nullable=True, index=False)
    published_at: Mapped[datetime] = created()


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("price_per_unit IS NULL OR price_per_unit >= 0", name="price_non_negative"),
        Index("ix_listings_browse", "crop_code", "state", "status"),
    )
    id: Mapped[uuid.UUID] = pk()
    farmer_id: Mapped[uuid.UUID] = user_fk()
    crop_code: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(1000))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    unit: Mapped[str] = mapped_column(enum("listing_unit", *UNITS))
    price_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    min_order_qty: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    state: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(enum("listing_status", *LISTING_STATUSES), server_default="open")
    created_at: Mapped[datetime] = created()


class Enquiry(Base):
    __tablename__ = "enquiries"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="enquiry_quantity_positive"),
        Index("uq_one_pending_enquiry", "listing_id", "buyer_id", unique=True,
              postgresql_where=text("status = 'pending'")),
    )
    id: Mapped[uuid.UUID] = pk()
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    buyer_id: Mapped[uuid.UUID] = user_fk()
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    message: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(enum("enquiry_status", *ENQUIRY_STATUSES), server_default="pending")
    created_at: Mapped[datetime] = created()
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (CheckConstraint("stars BETWEEN 1 AND 5", name="stars_1_to_5"),)
    id: Mapped[uuid.UUID] = pk()
    enquiry_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("enquiries.id", ondelete="CASCADE"), unique=True)
    farmer_id: Mapped[uuid.UUID] = user_fk()
    buyer_id: Mapped[uuid.UUID] = user_fk(index=False)
    stars: Mapped[int] = mapped_column(SmallInteger)
    comment: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = created()


class MarketPrice(Base):
    __tablename__ = "market_prices"
    __table_args__ = (
        UniqueConstraint("commodity", "variety", "market", "arrival_date", name="one_price_per_market_day"),
        Index("ix_market_prices_lookup", "commodity", "state", "arrival_date"),
    )
    id: Mapped[uuid.UUID] = pk()
    commodity: Mapped[str] = mapped_column(String(80))
    variety: Mapped[str] = mapped_column(String(80), server_default="")  # '' not NULL so the unique key works
    state: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(60))
    market: Mapped[str] = mapped_column(String(120))
    arrival_date: Mapped[date] = mapped_column(Date)
    min_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    max_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    modal_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    unit: Mapped[str] = mapped_column(String(20), server_default="Rs/quintal")
    source: Mapped[str] = mapped_column(String(120))
    fetched_at: Mapped[datetime] = created()
    is_demo: Mapped[bool]


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = user_fk()
    subject: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(String(2000))
    status: Mapped[str] = mapped_column(enum("ticket_status", "open", "closed"), server_default="open")
    created_at: Mapped[datetime] = created()


class AssistantAudit(Base):
    """One row per assistant turn. Never stores message content (plan §11.2)."""
    __tablename__ = "assistant_audit"
    id: Mapped[uuid.UUID] = pk()
    user_id: Mapped[uuid.UUID] = user_fk()
    request_id: Mapped[str] = mapped_column(String(64))
    route: Mapped[str] = mapped_column(String(1))
    tools: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    llm_status: Mapped[str] = mapped_column(String(20))
    latency_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = created()
