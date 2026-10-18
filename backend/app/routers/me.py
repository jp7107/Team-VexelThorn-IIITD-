"""Profile, crops and reminders for the logged-in user. Other users' rows return 404 (plan §8.1)."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import current_user, require_role
from app.models import CROP_STAGES, CropUpdate, FarmCrop, Reminder, User
from app.routers.auth import Place, UserOut

router = APIRouter(prefix="/me", tags=["me"])
farmer = require_role("farmer")
Stage = Literal[CROP_STAGES]


class ProfilePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    language: Literal["en", "hi"] | None = None
    state: Place | None = None
    district: Place | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)


@router.patch("", response_model=UserOut)
def update_profile(body: ProfilePatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key not in ("lat", "lon"):
            raise AppError(422, f"{key} cannot be empty")
        setattr(user, key, value)
    db.commit()
    return user


class CropIn(BaseModel):
    crop_code: str = Field(min_length=1, max_length=30)
    variety: str | None = Field(None, max_length=60)
    area_acres: Decimal = Field(gt=0, max_digits=8, decimal_places=2)
    sowing_date: date
    stage: Stage
    soil_type: str | None = Field(None, max_length=40)


class CropPatch(BaseModel):
    variety: str | None = Field(None, max_length=60)
    area_acres: Decimal | None = Field(None, gt=0, max_digits=8, decimal_places=2)
    sowing_date: date | None = None
    stage: Stage | None = None
    soil_type: str | None = Field(None, max_length=40)


class CropOut(CropIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime


def owned_crop(db: Session, crop_id: UUID, user: User) -> FarmCrop:
    crop = db.get(FarmCrop, crop_id)
    if crop is None or crop.farmer_id != user.id:
        raise AppError(404, "Crop not found")
    return crop


@router.get("/crops", response_model=list[CropOut])
def list_crops(user: User = Depends(farmer), db: Session = Depends(get_db)):
    return db.scalars(select(FarmCrop).where(FarmCrop.farmer_id == user.id).order_by(FarmCrop.created_at)).all()


@router.post("/crops", status_code=201, response_model=CropOut)
def add_crop(body: CropIn, user: User = Depends(farmer), db: Session = Depends(get_db)):
    crop = FarmCrop(**body.model_dump(), farmer_id=user.id)
    db.add(crop)
    db.commit()
    return crop


@router.get("/crops/{crop_id}", response_model=CropOut)
def get_crop(crop_id: UUID, user: User = Depends(farmer), db: Session = Depends(get_db)):
    return owned_crop(db, crop_id, user)


@router.patch("/crops/{crop_id}", response_model=CropOut)
def update_crop(crop_id: UUID, body: CropPatch, user: User = Depends(farmer), db: Session = Depends(get_db)):
    crop = owned_crop(db, crop_id, user)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key in ("area_acres", "sowing_date", "stage"):
            raise AppError(422, f"{key} cannot be empty")
        setattr(crop, key, value)
    db.commit()
    return crop


@router.delete("/crops/{crop_id}", status_code=204)
def delete_crop(crop_id: UUID, user: User = Depends(farmer), db: Session = Depends(get_db)):
    db.delete(owned_crop(db, crop_id, user))
    db.commit()
    return Response(status_code=204)


class CropUpdateIn(BaseModel):
    condition: Literal["good", "concern", "bad"]
    note: str | None = Field(None, max_length=500)


class CropUpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    condition: str
    note: str | None
    created_at: datetime


@router.get("/crops/{crop_id}/updates", response_model=list[CropUpdateOut])
def list_crop_updates(crop_id: UUID, user: User = Depends(farmer), db: Session = Depends(get_db)):
    crop = owned_crop(db, crop_id, user)
    q = select(CropUpdate).where(CropUpdate.farm_crop_id == crop.id).order_by(CropUpdate.created_at.desc())
    return db.scalars(q.limit(50)).all()


@router.post("/crops/{crop_id}/updates", status_code=201, response_model=CropUpdateOut)
def add_crop_update(crop_id: UUID, body: CropUpdateIn, user: User = Depends(farmer), db: Session = Depends(get_db)):
    crop = owned_crop(db, crop_id, user)
    note = body.note.strip() if body.note and body.note.strip() else None
    update = CropUpdate(farm_crop_id=crop.id, condition=body.condition, note=note)
    db.add(update)
    db.commit()
    return update


class ReminderIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    due_at: AwareDatetime
    farm_crop_id: UUID | None = None


class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    due_at: datetime
    done_at: datetime | None
    farm_crop_id: UUID | None
    source: str


@router.get("/reminders", response_model=list[ReminderOut])
def list_reminders(due: bool = False, user: User = Depends(farmer), db: Session = Depends(get_db)):
    q = select(Reminder).where(Reminder.user_id == user.id)
    if due:  # computed on read, no scheduler (plan T-11)
        q = q.where(Reminder.done_at.is_(None), Reminder.due_at <= datetime.now(UTC))
    return db.scalars(q.order_by(Reminder.due_at)).all()


@router.post("/reminders", status_code=201, response_model=ReminderOut)
def add_reminder(body: ReminderIn, user: User = Depends(farmer), db: Session = Depends(get_db)):
    if body.farm_crop_id:
        owned_crop(db, body.farm_crop_id, user)
    reminder = Reminder(**body.model_dump(), user_id=user.id, source="user")
    db.add(reminder)
    db.commit()
    return reminder


class ReminderPatch(BaseModel):
    done: bool


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(reminder_id: UUID, body: ReminderPatch, user: User = Depends(farmer),
                    db: Session = Depends(get_db)):
    reminder = db.get(Reminder, reminder_id)
    if reminder is None or reminder.user_id != user.id:
        raise AppError(404, "Reminder not found")
    reminder.done_at = datetime.now(UTC) if body.done else None
    db.commit()
    return reminder
