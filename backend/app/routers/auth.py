from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import ratelimit
from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import clear_session, current_user, hash_password, set_session, verify_password
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

# Indian mobile number, 10 digits, no country code.
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[6-9]\d{9}$")]
Place = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class RegisterIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    phone: Phone
    password: str = Field(min_length=8, max_length=128)
    # Admins are created by the seed script only, never by self-registration.
    role: Literal["farmer", "customer"]
    customer_type: Literal["retail", "wholesale"] | None = None
    language: Literal["en", "hi"] = "en"
    state: Place
    district: Place

    @model_validator(mode="after")
    def _customer_type(self):
        if (self.role == "customer") != (self.customer_type is not None):
            raise ValueError("customer_type is required for customers and not allowed for farmers")
        return self


class LoginIn(BaseModel):
    phone: Phone
    password: str = Field(max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    role: str
    customer_type: str | None
    language: str
    state: str
    district: str
    lat: float | None
    lon: float | None
    upi_id: str | None = None


@router.post("/register", status_code=201, response_model=UserOut,
             dependencies=[Depends(ratelimit.per_ip("register", 10, 600))])
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.phone == body.phone)):
        raise AppError(409, "This phone number is already registered")
    user = User(**body.model_dump(exclude={"password"}), password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two registrations racing for the same phone
        db.rollback()
        raise AppError(409, "This phone number is already registered")
    set_session(response, user)
    return user


@router.post("/login", response_model=UserOut, dependencies=[Depends(ratelimit.per_ip("login", 20, 600))])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    # Per account as well as per IP: a spoofed X-Forwarded-For can't buy more guesses at one phone number.
    ratelimit.hit(f"login:phone:{body.phone}", 5, 60)
    user = db.scalar(select(User).where(User.phone == body.phone))
    if not verify_password(user.password_hash if user else None, body.password):
        raise AppError(401, "Wrong phone number or password")
    if not user.is_active:
        raise AppError(403, "This account has been blocked. Contact support.", code="ACCOUNT_BLOCKED")
    set_session(response, user)
    return user


@router.post("/logout", status_code=204)
def logout(response: Response):
    clear_session(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
