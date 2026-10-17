"""Marketplace: listings and enquiries (plan §8.6, §14.1; tasks MKT-02, MKT-03).

No payments: buy/sell = listing -> enquiry -> farmer accepts -> buyer sees the farmer's phone (plan A-4, A-8).
A farmer's phone is never in listing responses, only in that buyer's accepted enquiry.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import current_user, require_role
from app.models import UNITS, Enquiry, Listing, Rating, User
from app.routers.auth import Place

router = APIRouter(tags=["marketplace"])
# Kilograms per unit, for comparing quantities across units. Dozens have no weight.
KG_PER_UNIT = case((Listing.unit == "kg", 1), (Listing.unit == "quintal", 100), (Listing.unit == "tonne", 1000),
                   else_=None)
farmer = require_role("farmer")
customer = require_role("customer")
Unit = Literal[UNITS]
MAX_QTY = Decimal("9999999999")


class ListingIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    crop_code: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(None, max_length=1000)
    quantity: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=2)
    unit: Unit
    price_per_unit: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    min_order_qty: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=2)
    state: Place | None = None  # defaults to the farmer's profile
    district: Place | None = None

    @model_validator(mode="after")
    def _min_order_fits(self):
        if self.min_order_qty is not None and self.min_order_qty > self.quantity:
            raise ValueError("min_order_qty cannot exceed quantity")
        return self


class ListingPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = Field(None, max_length=1000)
    quantity: Decimal | None = Field(None, gt=0, le=MAX_QTY, max_digits=12, decimal_places=2)
    price_per_unit: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    min_order_qty: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=2)
    status: Literal["open", "closed", "hidden"] | None = None


class Seller(BaseModel):
    id: UUID
    first_name: str
    rating_avg: float | None
    rating_count: int


class ListingOut(BaseModel):
    id: UUID
    crop_code: str
    title: str
    description: str | None
    quantity: Decimal
    unit: str
    price_per_unit: Decimal | None
    min_order_qty: Decimal | None
    state: str
    district: str
    status: str
    created_at: datetime
    farmer: Seller
    is_mine: bool
    pending_enquiries: int | None = None  # only for the owner


def _ratings(db: Session, farmer_ids: set[UUID]) -> dict[UUID, tuple[float | None, int]]:
    if not farmer_ids:
        return {}
    rows = db.execute(select(Rating.farmer_id, func.avg(Rating.stars), func.count())
                      .where(Rating.farmer_id.in_(farmer_ids)).group_by(Rating.farmer_id))
    return {fid: (round(float(avg), 1), n) for fid, avg, n in rows}


def listing_rows(db: Session, listings: list[Listing], viewer: User) -> list[ListingOut]:
    owners = {u.id: u for u in db.scalars(select(User).where(User.id.in_({l.farmer_id for l in listings})))}
    ratings = _ratings(db, set(owners))
    pending: dict[UUID, int] = {}
    mine = [l.id for l in listings if l.farmer_id == viewer.id]
    if mine:
        pending = dict(db.execute(select(Enquiry.listing_id, func.count()).where(
            Enquiry.listing_id.in_(mine), Enquiry.status == "pending").group_by(Enquiry.listing_id)).all())
    out = []
    for l in listings:
        owner = owners[l.farmer_id]
        avg, n = ratings.get(owner.id, (None, 0))
        out.append(ListingOut(
            id=l.id, crop_code=l.crop_code, title=l.title, description=l.description, quantity=l.quantity,
            unit=l.unit, price_per_unit=l.price_per_unit, min_order_qty=l.min_order_qty, state=l.state,
            district=l.district, status=l.status, created_at=l.created_at,
            farmer=Seller(id=owner.id, first_name=owner.name.split()[0], rating_avg=avg, rating_count=n),
            is_mine=l.farmer_id == viewer.id,
            pending_enquiries=pending.get(l.id, 0) if l.farmer_id == viewer.id else None,
        ))
    return out


@router.get("/listings", response_model=list[ListingOut])
def browse(crop_code: str | None = Query(None, max_length=30), state: str | None = Query(None, max_length=60),
           district: str | None = Query(None, max_length=60), min_quintal: Decimal | None = Query(None, gt=0),
           limit: int = Query(30, ge=1, le=50), offset: int = Query(0, ge=0, le=5000),
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Listing).where(Listing.status == "open")
    if crop_code:
        q = q.where(Listing.crop_code == crop_code)
    if state:
        q = q.where(Listing.state == state)
    if district:
        q = q.where(func.lower(Listing.district) == district.lower())
    if min_quintal is not None:  # wholesaler filter, in quintals whatever unit the listing uses
        q = q.where(Listing.quantity * KG_PER_UNIT >= min_quintal * 100)
    return listing_rows(db, list(db.scalars(q.order_by(Listing.created_at.desc()).limit(limit).offset(offset))), user)


@router.post("/listings", status_code=201, response_model=ListingOut)
def create_listing(body: ListingIn, user: User = Depends(farmer), db: Session = Depends(get_db)):
    data = body.model_dump()
    data["state"] = data["state"] or user.state
    data["district"] = data["district"] or user.district
    listing = Listing(**data, farmer_id=user.id)
    db.add(listing)
    db.commit()
    return listing_rows(db, [listing], user)[0]


@router.get("/me/listings", response_model=list[ListingOut])
def my_listings(user: User = Depends(farmer), db: Session = Depends(get_db)):
    q = select(Listing).where(Listing.farmer_id == user.id).order_by(Listing.created_at.desc())
    return listing_rows(db, list(db.scalars(q)), user)


def _visible_listing(db: Session, listing_id: UUID, user: User) -> Listing:
    listing = db.get(Listing, listing_id)
    # Hidden and closed listings stay visible to their owner and to admins only.
    if listing is None or (listing.status != "open" and listing.farmer_id != user.id and user.role != "admin"):
        raise AppError(404, "Listing not found")
    return listing


@router.get("/listings/{listing_id}", response_model=ListingOut)
def get_listing(listing_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return listing_rows(db, [_visible_listing(db, listing_id, user)], user)[0]


@router.patch("/listings/{listing_id}", response_model=ListingOut)
def update_listing(listing_id: UUID, body: ListingPatch, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    listing = db.get(Listing, listing_id)
    changes = body.model_dump(exclude_unset=True)
    if user.role == "admin":  # moderation only: hide or unhide (plan §14.4)
        if listing is None:
            raise AppError(404, "Listing not found")
        if set(changes) != {"status"} or changes["status"] not in ("hidden", "open"):
            raise AppError(403, "Admins can only hide or unhide listings")
    else:
        if listing is None or listing.farmer_id != user.id:
            raise AppError(404, "Listing not found")
        if changes.get("status") == "hidden" or (listing.status == "hidden" and "status" in changes):
            raise AppError(403, "Only admins can hide or unhide listings")
        for key in ("title", "quantity"):
            if key in changes and changes[key] is None:
                raise AppError(422, f"{key} cannot be empty")
    for key, value in changes.items():
        setattr(listing, key, value)
    if listing.min_order_qty is not None and listing.min_order_qty > listing.quantity:
        raise AppError(422, "min_order_qty cannot exceed quantity")
    db.commit()
    return listing_rows(db, [listing], user)[0]


# --- enquiries ---

class EnquiryIn(BaseModel):
    quantity: Decimal = Field(gt=0, le=MAX_QTY, max_digits=12, decimal_places=2)
    message: str | None = Field(None, max_length=500)


class EnquiryOut(BaseModel):
    id: UUID
    listing_id: UUID
    listing_title: str
    crop_code: str
    unit: str
    quantity: Decimal
    message: str | None
    status: str
    created_at: datetime
    responded_at: datetime | None
    buyer_first_name: str
    buyer_type: str | None
    farmer_first_name: str
    farmer_phone: str | None  # only for the buyer, only once accepted
    can_rate: bool = False
    my_rating: int | None = None  # the buyer's own stars, once given


def _enquiry_out(e: Enquiry, listing: Listing, buyer: User, owner: User, viewer: User) -> EnquiryOut:
    reveal = viewer.id == buyer.id and e.status == "accepted"
    return EnquiryOut(
        id=e.id, listing_id=listing.id, listing_title=listing.title, crop_code=listing.crop_code, unit=listing.unit,
        quantity=e.quantity, message=e.message, status=e.status, created_at=e.created_at,
        responded_at=e.responded_at, buyer_first_name=buyer.name.split()[0], buyer_type=buyer.customer_type,
        farmer_first_name=owner.name.split()[0], farmer_phone=owner.phone if reveal else None,
    )


@router.post("/listings/{listing_id}/enquiries", status_code=201, response_model=EnquiryOut)
def create_enquiry(listing_id: UUID, body: EnquiryIn, user: User = Depends(customer), db: Session = Depends(get_db)):
    listing = _visible_listing(db, listing_id, user)
    if listing.status != "open":
        raise AppError(422, "This listing is no longer open")
    if body.quantity > listing.quantity:
        raise AppError(422, "You asked for more than is listed")
    enquiry = Enquiry(listing_id=listing.id, buyer_id=user.id, quantity=body.quantity,
                      message=body.message.strip() if body.message else None)
    db.add(enquiry)
    try:
        db.commit()
    except IntegrityError:  # partial unique index: one pending enquiry per buyer per listing
        db.rollback()
        raise AppError(409, "You already have a pending enquiry for this listing")
    return _enquiry_out(enquiry, listing, user, db.get(User, listing.farmer_id), user)


@router.get("/me/enquiries", response_model=list[EnquiryOut])
def my_enquiries(user: User = Depends(require_role("farmer", "customer")), db: Session = Depends(get_db)):
    q = select(Enquiry, Listing).join(Listing, Enquiry.listing_id == Listing.id)
    q = q.where(Listing.farmer_id == user.id) if user.role == "farmer" else q.where(Enquiry.buyer_id == user.id)
    rows = db.execute(q.order_by(Enquiry.created_at.desc()).limit(100)).all()
    people = {u.id: u for u in db.scalars(select(User).where(User.id.in_(
        {e.buyer_id for e, _ in rows} | {l.farmer_id for _, l in rows})))}
    rated = dict(db.execute(select(Rating.enquiry_id, Rating.stars)
                            .where(Rating.enquiry_id.in_([e.id for e, _ in rows]))).all())
    out = []
    for e, listing in rows:
        item = _enquiry_out(e, listing, people[e.buyer_id], people[listing.farmer_id], user)
        if user.role == "customer":
            item.can_rate = e.status == "accepted" and e.id not in rated
            item.my_rating = rated.get(e.id)
        out.append(item)
    return out


# Allowed status changes: who may move an enquiry from which status to which (plan §6.5).
TRANSITIONS = {("farmer", "pending", "accepted"), ("farmer", "pending", "declined"),
               ("customer", "pending", "withdrawn")}


class EnquiryPatch(BaseModel):
    status: Literal["accepted", "declined", "withdrawn"]


@router.patch("/enquiries/{enquiry_id}", response_model=EnquiryOut)
def update_enquiry(enquiry_id: UUID, body: EnquiryPatch, user: User = Depends(require_role("farmer", "customer")),
                   db: Session = Depends(get_db)):
    enquiry = db.get(Enquiry, enquiry_id)
    listing = db.get(Listing, enquiry.listing_id) if enquiry else None
    party = (user.role == "farmer" and listing is not None and listing.farmer_id == user.id) or \
            (user.role == "customer" and enquiry is not None and enquiry.buyer_id == user.id)
    if not party:
        raise AppError(404, "Enquiry not found")
    if (user.role, enquiry.status, body.status) not in TRANSITIONS:
        raise AppError(409, f"Can't change an enquiry from {enquiry.status} to {body.status}")
    enquiry.status = body.status
    enquiry.responded_at = datetime.now(UTC)
    db.commit()
    return _enquiry_out(enquiry, listing, db.get(User, enquiry.buyer_id), db.get(User, listing.farmer_id), user)


# --- ratings (MKT-05) ---

class RatingIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str | None = Field(None, max_length=300)


class RatingOut(BaseModel):
    stars: int
    comment: str | None
    buyer_first_name: str
    created_at: datetime


class FarmerRatings(BaseModel):
    farmer_id: UUID
    avg: float | None
    count: int
    recent: list[RatingOut]


@router.post("/enquiries/{enquiry_id}/rating", status_code=201, response_model=RatingOut)
def rate_farmer(enquiry_id: UUID, body: RatingIn, user: User = Depends(customer), db: Session = Depends(get_db)):
    """Only the buyer of an accepted enquiry may rate, once (plan A-5: real counterparties only)."""
    enquiry = db.get(Enquiry, enquiry_id)
    if enquiry is None or enquiry.buyer_id != user.id:
        raise AppError(404, "Enquiry not found")
    if enquiry.status != "accepted":
        raise AppError(409, "You can rate a farmer after they accept your enquiry")
    listing = db.get(Listing, enquiry.listing_id)
    comment = body.comment.strip() if body.comment and body.comment.strip() else None
    rating = Rating(enquiry_id=enquiry.id, farmer_id=listing.farmer_id, buyer_id=user.id, stars=body.stars,
                    comment=comment)
    db.add(rating)
    try:
        db.commit()
    except IntegrityError:  # ratings.enquiry_id is unique
        db.rollback()
        raise AppError(409, "You have already rated this enquiry")
    return RatingOut(stars=rating.stars, comment=rating.comment, buyer_first_name=user.name.split()[0],
                     created_at=rating.created_at)


@router.get("/farmers/{farmer_id}/ratings", response_model=FarmerRatings)
def farmer_ratings(farmer_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    farmer_user = db.get(User, farmer_id)
    if farmer_user is None or farmer_user.role != "farmer":
        raise AppError(404, "Farmer not found")
    avg, count = _ratings(db, {farmer_id}).get(farmer_id, (None, 0))
    rows = db.execute(select(Rating, User.name).join(User, Rating.buyer_id == User.id)
                      .where(Rating.farmer_id == farmer_id).order_by(Rating.created_at.desc()).limit(5)).all()
    return FarmerRatings(farmer_id=farmer_id, avg=avg, count=count, recent=[
        RatingOut(stars=r.stars, comment=r.comment, buyer_first_name=name.split()[0], created_at=r.created_at)
        for r, name in rows])
