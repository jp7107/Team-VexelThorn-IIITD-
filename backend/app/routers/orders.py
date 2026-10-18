"""Orders, payments and receipts: the end of the buy/sell flow.

listing -> enquiry -> farmer accepts (an order is created and the stock comes off the listing at once)
-> buyer pays: online through Razorpay test mode, or UPI straight to the farmer / cash, which the farmer confirms
-> paid (a numbered receipt exists) -> farmer dispatches -> buyer confirms delivery -> buyer may rate.
Cancelling before payment returns the stock. Every change is checked against TRANSITIONS.
"""

import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.core import ratelimit
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.core.platform import get_config, online_payments_configured
from app.core.security import current_user, require_role
from app.models import Enquiry, Listing, Order, User

router = APIRouter(tags=["orders"])
party = require_role("farmer", "customer", "admin")
CENT = Decimal("0.01")
RAZORPAY_ORDERS = "https://api.razorpay.com/v1/orders"


def money(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


def restock(db: Session, order: Order) -> None:
    listing = db.get(Listing, order.listing_id, with_for_update=True)
    listing.quantity += order.quantity
    if listing.status == "sold_out":
        listing.status = "open"


def create_order(db: Session, enquiry: Enquiry, listing: Listing, price: Decimal | None) -> Order:
    """Called inside the accept transaction, with the listing row locked."""
    if listing.status not in ("open", "sold_out"):
        raise AppError(409, "This listing is not open, so the enquiry can't be accepted")
    if enquiry.quantity > listing.quantity:
        raise AppError(409, f"Only {listing.quantity.normalize():f} {listing.unit} left; this enquiry asks for more",
                       code="NOT_ENOUGH_STOCK", details={"available": str(listing.quantity)})
    unit_price = listing.price_per_unit if price is None else price
    if unit_price is None:
        raise AppError(422, "Set the price per unit to accept this enquiry (the listing has no price)",
                       code="PRICE_REQUIRED")
    fee_pct = get_config(db).platform_fee_percent
    subtotal = money(enquiry.quantity * unit_price)
    fee = money(subtotal * fee_pct / 100)
    listing.quantity -= enquiry.quantity
    if listing.quantity == 0:
        listing.status = "sold_out"
    order = Order(enquiry_id=enquiry.id, listing_id=listing.id, buyer_id=enquiry.buyer_id, farmer_id=listing.farmer_id,
                  crop_code=listing.crop_code, title=listing.title, unit=listing.unit, quantity=enquiry.quantity,
                  price_per_unit=unit_price, subtotal=subtotal, platform_fee=fee, total=subtotal + fee)
    db.add(order)
    return order


def expire_unpaid(db: Session) -> None:
    """Cancel orders left unpaid past the admin's limit and return their stock.
    ponytail: runs lazily on order reads; move to a scheduled job if traffic grows."""
    cutoff = datetime.now(UTC) - timedelta(hours=get_config(db).unpaid_order_hours)
    stale = db.scalars(select(Order).where(Order.status == "awaiting_payment", Order.created_at < cutoff)
                       .with_for_update(skip_locked=True)).all()
    for order in stale:
        restock(db, order)
        order.status, order.cancelled_by, order.cancelled_at = "cancelled", "system", datetime.now(UTC)
        order.cancel_reason = "Not paid in time"
    if stale:
        db.commit()


class OrderOut(BaseModel):
    id: UUID
    enquiry_id: UUID
    listing_id: UUID
    crop_code: str
    title: str
    unit: str
    quantity: Decimal
    price_per_unit: Decimal
    subtotal: Decimal
    platform_fee: Decimal
    total: Decimal
    status: str
    payment_method: str | None
    payment_ref: str | None
    receipt_no: str | None
    cancelled_by: str | None
    cancel_reason: str | None
    created_at: datetime
    paid_at: datetime | None
    dispatched_at: datetime | None
    delivered_at: datetime | None
    cancelled_at: datetime | None
    role: Literal["buyer", "farmer", "admin"]
    buyer_name: str
    buyer_district: str
    farmer_name: str
    farmer_district: str
    farmer_phone: str | None  # buyer sees it (the enquiry was accepted); admins too
    buyer_phone: str | None  # farmer sees it once there is an order to deliver
    farmer_upi_id: str | None  # only for the buyer while payment is due, and only if UPI is enabled
    pay_methods: list[str]  # what the buyer can use right now


def order_out(db: Session, o: Order, viewer: User) -> OrderOut:
    buyer, farmer = db.get(User, o.buyer_id), db.get(User, o.farmer_id)
    role = "admin" if viewer.role == "admin" else "buyer" if viewer.id == o.buyer_id else "farmer"
    config = get_config(db)
    methods: list[str] = []
    if role == "buyer" and o.status == "awaiting_payment":
        if config.payments_online and online_payments_configured():
            methods.append("online")
        if config.payments_upi and farmer.upi_id:
            methods.append("upi")
        if config.payments_cash:
            methods.append("cash")
    return OrderOut(
        **{k: getattr(o, k) for k in OrderOut.model_fields if hasattr(o, k)},
        role=role, buyer_name=buyer.name, buyer_district=f"{buyer.district}, {buyer.state}", farmer_name=farmer.name,
        farmer_district=f"{farmer.district}, {farmer.state}",
        farmer_phone=farmer.phone if role in ("buyer", "admin") else None,
        buyer_phone=buyer.phone if role in ("farmer", "admin") else None,
        farmer_upi_id=farmer.upi_id if "upi" in methods else None, pay_methods=methods,
    )


def _party_order(db: Session, order_id: UUID, user: User, lock: bool = False) -> Order:
    order = db.get(Order, order_id, with_for_update=lock)
    if order is None or (user.role != "admin" and user.id not in (order.buyer_id, order.farmer_id)):
        raise AppError(404, "Order not found")
    return order


@router.get("/me/orders", response_model=list[OrderOut])
def my_orders(status: str | None = Query(None, max_length=30), user: User = Depends(require_role("farmer", "customer")),
              db: Session = Depends(get_db)):
    expire_unpaid(db)
    q = select(Order).where(or_(Order.buyer_id == user.id, Order.farmer_id == user.id))
    if status:
        q = q.where(Order.status == status)
    return [order_out(db, o, user) for o in db.scalars(q.order_by(Order.created_at.desc()).limit(100))]


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: UUID, user: User = Depends(party), db: Session = Depends(get_db)):
    expire_unpaid(db)
    return order_out(db, _party_order(db, order_id, user), user)


def _mark_paid(db: Session, order: Order) -> None:
    order.status, order.paid_at = "paid", datetime.now(UTC)
    seq = db.execute(text("SELECT nextval('receipt_seq')")).scalar_one()
    order.receipt_no = f"KM-{order.paid_at:%Y}-{seq:06d}"


# --- paying ---

class PayIn(BaseModel):
    method: Literal["online", "upi", "cash"]
    upi_ref: str | None = Field(None, min_length=6, max_length=40, pattern=r"^[A-Za-z0-9-]+$")


class GatewayOrder(BaseModel):
    key_id: str
    gateway_order_id: str
    amount: int  # paise
    currency: str


class PayOut(BaseModel):
    order: OrderOut
    gateway: GatewayOrder | None = None


@router.post("/orders/{order_id}/payment", response_model=PayOut,
             dependencies=[Depends(ratelimit.per_user("payments", (20, 3600)))])
def start_payment(order_id: UUID, body: PayIn, user: User = Depends(require_role("customer")),
                  db: Session = Depends(get_db)):
    expire_unpaid(db)
    order = _party_order(db, order_id, user, lock=True)
    if order.buyer_id != user.id:
        raise AppError(404, "Order not found")
    if order.status != "awaiting_payment":
        raise AppError(409, "This order isn't waiting for payment")
    if body.method not in order_out(db, order, user).pay_methods:
        raise AppError(422, "That payment method isn't available for this order", code="METHOD_UNAVAILABLE")

    if body.method == "online":
        s = get_settings()
        try:
            r = httpx.post(RAZORPAY_ORDERS, auth=(s.RAZORPAY_KEY_ID, s.RAZORPAY_KEY_SECRET), timeout=15, json={
                "amount": int(order.total * 100), "currency": "INR", "receipt": str(order.id)[:40],
                "notes": {"order_id": str(order.id)}})
            r.raise_for_status()
        except httpx.HTTPError:
            raise AppError(502, "The payment gateway didn't respond. Try again or pay by UPI or cash.",
                           code="GATEWAY_ERROR")
        order.gateway_order_id, order.payment_method = r.json()["id"], "online"
        db.commit()
        return PayOut(order=order_out(db, order, user), gateway=GatewayOrder(
            key_id=s.RAZORPAY_KEY_ID, gateway_order_id=order.gateway_order_id, amount=int(order.total * 100),
            currency="INR"))

    if body.method == "upi" and not body.upi_ref:
        raise AppError(422, "Enter the UPI transaction reference from your payment app", code="UPI_REF_REQUIRED")
    # UPI and cash go straight to the farmer; they confirm the money arrived before the order counts as paid.
    order.payment_method, order.payment_ref, order.status = body.method, body.upi_ref, "payment_submitted"
    db.commit()
    return PayOut(order=order_out(db, order, user))


class VerifyIn(BaseModel):
    razorpay_order_id: str = Field(max_length=60)
    razorpay_payment_id: str = Field(max_length=60)
    razorpay_signature: str = Field(max_length=128)


@router.post("/orders/{order_id}/payment/verify", response_model=OrderOut)
def verify_payment(order_id: UUID, body: VerifyIn, user: User = Depends(require_role("customer")),
                   db: Session = Depends(get_db)):
    order = _party_order(db, order_id, user, lock=True)
    if order.buyer_id != user.id:
        raise AppError(404, "Order not found")
    if order.status != "awaiting_payment" or order.payment_method != "online" \
            or order.gateway_order_id != body.razorpay_order_id:
        raise AppError(409, "This payment doesn't match the order")
    secret = get_settings().RAZORPAY_KEY_SECRET.encode()
    # Razorpay: generated_signature = hmac_sha256(order_id + "|" + razorpay_payment_id, secret)
    expected = hmac.new(secret, f"{order.gateway_order_id}|{body.razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise AppError(400, "Payment signature check failed; the order was not marked paid", code="BAD_SIGNATURE")
    order.payment_ref = body.razorpay_payment_id
    _mark_paid(db, order)
    db.commit()
    return order_out(db, order, user)


# --- after payment, and cancelling ---

# (who, from status, action) -> new status
TRANSITIONS = {
    ("farmer", "payment_submitted", "confirm_payment"): "paid",
    ("farmer", "payment_submitted", "reject_payment"): "awaiting_payment",
    ("farmer", "paid", "dispatch"): "dispatched",
    ("buyer", "dispatched", "deliver"): "delivered",
    ("buyer", "paid", "deliver"): "delivered",  # collected in person
    ("buyer", "awaiting_payment", "cancel"): "cancelled",
    ("farmer", "awaiting_payment", "cancel"): "cancelled",
    ("farmer", "payment_submitted", "cancel"): "cancelled",
    ("admin", "awaiting_payment", "cancel"): "cancelled",
    ("admin", "payment_submitted", "cancel"): "cancelled",
}


class OrderAction(BaseModel):
    action: Literal["confirm_payment", "reject_payment", "dispatch", "deliver", "cancel"]
    reason: str | None = Field(None, max_length=300)


@router.patch("/orders/{order_id}", response_model=OrderOut)
def act_on_order(order_id: UUID, body: OrderAction, user: User = Depends(party), db: Session = Depends(get_db)):
    order = _party_order(db, order_id, user, lock=True)
    who = "admin" if user.role == "admin" else "buyer" if user.id == order.buyer_id else "farmer"
    new = TRANSITIONS.get((who, order.status, body.action))
    if new is None:
        raise AppError(409, f"Can't {body.action.replace('_', ' ')} an order that is {order.status.replace('_', ' ')}")
    now = datetime.now(UTC)
    if body.action == "confirm_payment":
        _mark_paid(db, order)
    elif body.action == "reject_payment":  # the farmer didn't receive it: the buyer can try again
        order.status, order.payment_method, order.payment_ref = new, None, None
    elif body.action == "dispatch":
        order.status, order.dispatched_at = new, now
    elif body.action == "deliver":
        order.status, order.delivered_at = new, now
    else:
        restock(db, order)
        order.status, order.cancelled_at, order.cancelled_by = new, now, who
        order.cancel_reason = body.reason.strip() if body.reason and body.reason.strip() else None
    db.commit()
    return order_out(db, order, user)


class ReceiptOut(BaseModel):
    receipt_no: str
    issued_at: datetime
    order: OrderOut


@router.get("/orders/{order_id}/receipt", response_model=ReceiptOut)
def receipt(order_id: UUID, user: User = Depends(party), db: Session = Depends(get_db)):
    order = _party_order(db, order_id, user)
    if order.receipt_no is None:
        raise AppError(404, "There is no receipt until the payment is confirmed")
    return ReceiptOut(receipt_no=order.receipt_no, issued_at=order.paid_at, order=order_out(db, order, user))
