"""Admin console data and the configuration everyone reads: dashboard stats, platform settings, crop
catalogue, user blocking, orders oversight and manually entered mandi prices."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.platform import PlatformConfig, get_config, online_payments_configured, save_config
from app.core.security import require_role
from app.ml import inference
from app.models import (
    Analysis, AssistantAudit, CropType, DiseaseClass, Enquiry, Listing, MarketPrice, Order, SupportTicket, User,
)
from app.routers.orders import OrderOut, expire_unpaid, order_out

router = APIRouter(tags=["admin"])
admin = require_role("admin")


# --- configuration everyone reads ---

class PublicConfig(BaseModel):
    helpline_number: str
    helpline_short: str
    helpline_open_hour: int
    helpline_close_hour: int
    helpline_languages: int
    support_phone: str
    support_email: str
    platform_fee_percent: Decimal
    payment_methods: list[str]
    assistant_enabled: bool
    show_demo_prices: bool
    announcement: str


@router.get("/config", response_model=PublicConfig)
def public_config(db: Session = Depends(get_db)):
    c = get_config(db)
    methods = [m for m, on in (("online", c.payments_online and online_payments_configured()),
                               ("upi", c.payments_upi), ("cash", c.payments_cash)) if on]
    return PublicConfig(**c.model_dump(include=set(PublicConfig.model_fields)), payment_methods=methods)


class CropOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    name_en: str
    name_hi: str
    mandi_commodity: str | None
    marketplace: bool
    active: bool
    sort_order: int
    leaf_check: bool = False  # the disease model knows this crop (from the model's labels, not editable)


def _crop_rows(crops) -> list[CropOut]:
    supported = {c["crop_code"] for c in inference.labels()}
    return [CropOut.model_validate(c).model_copy(update={"leaf_check": c.code in supported}) for c in crops]


@router.get("/crops", response_model=list[CropOut])
def list_crops(db: Session = Depends(get_db)):
    q = select(CropType).where(CropType.active.is_(True)).order_by(CropType.sort_order, CropType.name_en)
    return _crop_rows(db.scalars(q))


# --- settings ---

class SettingsOut(PlatformConfig):
    online_gateway_configured: bool


@router.get("/admin/settings", response_model=SettingsOut)
def get_settings_(user: User = Depends(admin), db: Session = Depends(get_db)):
    return SettingsOut(**get_config(db).model_dump(), online_gateway_configured=online_payments_configured())


@router.put("/admin/settings", response_model=SettingsOut)
def put_settings(body: PlatformConfig, user: User = Depends(admin), db: Session = Depends(get_db)):
    if body.helpline_close_hour <= body.helpline_open_hour:
        raise AppError(422, "The helpline must close after it opens")
    config = save_config(db, body, user.id)
    return SettingsOut(**config.model_dump(), online_gateway_configured=online_payments_configured())


# --- crop catalogue ---

class CropIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    code: str = Field(min_length=2, max_length=30, pattern=r"^[a-z][a-z0-9_]*$")
    name_en: str = Field(min_length=1, max_length=60)
    name_hi: str = Field(min_length=1, max_length=60)
    mandi_commodity: str | None = Field(None, max_length=80)
    marketplace: bool = True
    active: bool = True
    sort_order: int = Field(0, ge=0, le=999)


@router.get("/admin/crops", response_model=list[CropOut])
def admin_crops(user: User = Depends(admin), db: Session = Depends(get_db)):
    return _crop_rows(db.scalars(select(CropType).order_by(CropType.sort_order, CropType.name_en)))


@router.put("/admin/crops/{code}", response_model=CropOut)
def upsert_crop(code: str, body: CropIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    if body.code != code:
        raise AppError(422, "The crop code can't be changed")
    crop = db.get(CropType, code) or CropType(code=code)
    data = body.model_dump()
    data["mandi_commodity"] = data["mandi_commodity"] or None
    for key, value in data.items():
        setattr(crop, key, value)
    db.add(crop)
    db.commit()
    return _crop_rows([crop])[0]


# --- users ---

class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    role: str
    customer_type: str | None
    state: str
    district: str
    is_active: bool
    created_at: datetime


@router.get("/admin/users", response_model=list[AdminUserOut])
def admin_users(role: Literal["farmer", "customer", "admin"] | None = None, q: str | None = Query(None, max_length=60),
                user: User = Depends(admin), db: Session = Depends(get_db)):
    # Phone numbers are deliberately not listed: moderation doesn't need them.
    query = select(User).order_by(User.created_at.desc()).limit(300)
    if role:
        query = query.where(User.role == role)
    if q:
        like = f"%{q.replace('%', '').replace('_', '')}%"
        query = query.where(User.name.ilike(like) | User.district.ilike(like) | User.state.ilike(like))
    return db.scalars(query).all()


class UserPatch(BaseModel):
    is_active: bool


@router.patch("/admin/users/{user_id}", response_model=AdminUserOut)
def block_user(user_id: UUID, body: UserPatch, user: User = Depends(admin), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise AppError(404, "User not found")
    if target.id == user.id:
        raise AppError(409, "You can't block your own account")
    target.is_active = body.is_active
    db.commit()
    return target


# --- orders ---

@router.get("/admin/orders", response_model=list[OrderOut])
def admin_orders(status: str | None = Query(None, max_length=30), user: User = Depends(admin),
                 db: Session = Depends(get_db)):
    expire_unpaid(db)
    q = select(Order).order_by(Order.created_at.desc()).limit(200)
    if status:
        q = q.where(Order.status == status)
    return [order_out(db, o, user) for o in db.scalars(q)]


# --- manually entered mandi prices (when there is no live data.gov.in key) ---

class PriceIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    commodity: str = Field(min_length=1, max_length=80)
    variety: str = Field("", max_length=80)
    state: str = Field(min_length=1, max_length=60)
    district: str = Field(min_length=1, max_length=60)
    market: str = Field(min_length=1, max_length=120)
    arrival_date: date
    min_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    max_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    modal_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)


class PriceOut(PriceIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source: str
    is_demo: bool


@router.get("/admin/prices", response_model=list[PriceOut])
def admin_prices(user: User = Depends(admin), db: Session = Depends(get_db)):
    q = select(MarketPrice).where(MarketPrice.source.like("Admin entry%"))
    return db.scalars(q.order_by(MarketPrice.arrival_date.desc()).limit(200)).all()


@router.post("/admin/prices", status_code=201, response_model=PriceOut)
def add_price(body: PriceIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    if not body.min_price <= body.modal_price <= body.max_price:
        raise AppError(422, "Modal price must be between the min and max price")
    if body.arrival_date > date.today():
        raise AppError(422, "The price date can't be in the future")
    row = MarketPrice(**body.model_dump(), source=f"Admin entry ({user.name})", is_demo=False,
                      fetched_at=datetime.now(UTC))
    db.add(row)
    db.commit()
    return row


@router.delete("/admin/prices/{price_id}", status_code=204)
def delete_price(price_id: UUID, user: User = Depends(admin), db: Session = Depends(get_db)):
    row = db.get(MarketPrice, price_id)
    if row is None or not row.source.startswith("Admin entry"):
        raise AppError(404, "Price not found")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


# --- dashboard ---

class DayPoint(BaseModel):
    date: date
    signups: int
    orders: int
    sales: Decimal
    leaf_checks: int
    chats: int


class Named(BaseModel):
    key: str
    label: str
    value: Decimal


class Stats(BaseModel):
    days: int
    totals: dict[str, Decimal]
    daily: list[DayPoint]
    funnel: list[Named]
    orders_by_status: list[Named]
    listings_by_crop: list[Named]
    top_diseases: list[Named]
    users_by_state: list[Named]


def _per_day(db: Session, column, since: datetime, where=None, value=None) -> dict[date, Decimal]:
    day = cast(column, Date)
    q = select(day, value if value is not None else func.count()).where(column >= since)
    if where is not None:
        q = q.where(where)
    return {d: Decimal(v or 0) for d, v in db.execute(q.group_by(day))}


@router.get("/admin/stats", response_model=Stats)
def stats(days: int = Query(30, ge=7, le=180), user: User = Depends(admin), db: Session = Depends(get_db)):
    expire_unpaid(db)
    today = datetime.now(UTC).date()
    since = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=UTC)
    paid = Order.status.in_(("paid", "dispatched", "delivered"))

    signups = _per_day(db, User.created_at, since)
    orders = _per_day(db, Order.created_at, since)
    sales = _per_day(db, Order.paid_at, since, paid, func.sum(Order.total))
    checks = _per_day(db, Analysis.created_at, since)
    chats = _per_day(db, AssistantAudit.created_at, since)
    daily = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        daily.append(DayPoint(date=d, signups=int(signups.get(d, 0)), orders=int(orders.get(d, 0)),
                              sales=sales.get(d, Decimal(0)), leaf_checks=int(checks.get(d, 0)),
                              chats=int(chats.get(d, 0))))

    count = lambda m, *w: Decimal(db.scalar(select(func.count()).select_from(m).where(*w)) or 0)  # noqa: E731
    role_count = dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())
    fallbacks = count(AssistantAudit, AssistantAudit.llm_status != "ok", AssistantAudit.created_at >= since)
    chat_total = count(AssistantAudit, AssistantAudit.created_at >= since)
    totals = {
        "farmers": Decimal(role_count.get("farmer", 0)), "buyers": Decimal(role_count.get("customer", 0)),
        "blocked": count(User, User.is_active.is_(False)),
        "open_listings": count(Listing, Listing.status == "open"),
        "orders": count(Order, Order.created_at >= since),
        "sales": Decimal(db.scalar(select(func.coalesce(func.sum(Order.total), 0)).where(paid, Order.paid_at >= since))),
        "platform_fees": Decimal(db.scalar(select(func.coalesce(func.sum(Order.platform_fee), 0))
                                           .where(paid, Order.paid_at >= since))),
        "leaf_checks": count(Analysis, Analysis.created_at >= since),
        "chats": chat_total,
        "ai_fallback_pct": (fallbacks * 100 / chat_total).quantize(Decimal("0.1")) if chat_total else Decimal(0),
        "open_tickets": count(SupportTicket, SupportTicket.status == "open"),
        "awaiting_confirmation": count(Order, Order.status == "payment_submitted"),
    }

    by_status = dict(db.execute(select(Order.status, func.count()).where(Order.created_at >= since)
                                .group_by(Order.status)).all())
    enquiries = count(Enquiry, Enquiry.created_at >= since)
    accepted = sum(by_status.values())
    paid_n = sum(by_status.get(s, 0) for s in ("paid", "dispatched", "delivered"))
    funnel = [Named(key="enquiries", label="Enquiries", value=enquiries),
              Named(key="orders", label="Accepted (orders)", value=accepted),
              Named(key="paid", label="Paid", value=paid_n),
              Named(key="delivered", label="Delivered", value=by_status.get("delivered", 0))]

    names = {c.code: c.name_en for c in db.scalars(select(CropType))}
    by_crop = db.execute(select(Listing.crop_code, func.count()).where(Listing.status == "open")
                         .group_by(Listing.crop_code).order_by(func.count().desc()).limit(8)).all()
    disease_names = {c.code: c.name_en for c in db.scalars(select(DiseaseClass))}
    diseases = db.execute(select(Analysis.predicted_class, func.count()).where(
        Analysis.created_at >= since, Analysis.status == "ok", Analysis.predicted_class.is_not(None))
        .group_by(Analysis.predicted_class).order_by(func.count().desc()).limit(6)).all()
    states = db.execute(select(User.state, func.count()).where(User.role != "admin").group_by(User.state)
                        .order_by(func.count().desc()).limit(8)).all()
    return Stats(
        days=days, totals=totals, daily=daily, funnel=funnel,
        orders_by_status=[Named(key=k, label=k.replace("_", " "), value=v) for k, v in by_status.items()],
        listings_by_crop=[Named(key=c, label=names.get(c, c), value=n) for c, n in by_crop],
        top_diseases=[Named(key=c, label=disease_names.get(c, c), value=n) for c, n in diseases],
        users_by_state=[Named(key=s, label=s, value=n) for s, n in states],
    )
