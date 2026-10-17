"""Auth endpoints — IMPLEMENTATION_PLAN.md §14.2."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.errors import AuthError, ConflictError, ForbiddenError
from app.models import FarmerCrop, User
from app.schemas import LoginRequest, ProfileUpdate, RegisterRequest, TokenOut, UserOut
from app.security import create_access_token, hash_password, needs_rehash, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

# Registration may never create an admin; admins exist only via the CLI
# (plan §2.1: seeded account only, no public signup).
SELF_REGISTER_ROLES = ("farmer", "customer", "wholesaler")


def _token_response(user: User) -> TokenOut:
    return TokenOut(user=UserOut.model_validate(user), access_token=create_access_token(user.id, user.role))


@router.post(
    "/register",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a farmer, customer or wholesaler",
)
def register(payload: RegisterRequest, session: DbSession) -> TokenOut:
    if payload.role not in SELF_REGISTER_ROLES:
        raise ForbiddenError("ROLE_NOT_ALLOWED", "This account type cannot be self-registered.")

    if session.scalar(select(User.id).where(User.phone == payload.phone)) is not None:
        raise ConflictError("PHONE_TAKEN", "This phone number is already registered.", field="phone")

    user = User(
        phone=payload.phone,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        language=payload.lang,
        village=payload.village,
        district=payload.district,
        state=payload.state,
        is_new=True,
    )
    session.add(user)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise ConflictError("PHONE_TAKEN", "This phone number is already registered.", field="phone") from exc

    # Crops belong to farmers only; a customer passing crop names is ignored
    # rather than silently stored against a non-farmer account.
    if payload.role == "farmer":
        for crop in payload.crops:
            session.add(FarmerCrop(farmer_id=user.id, crop=crop))

    session.commit()
    return _token_response(user)


@router.post("/login", response_model=TokenOut, summary="Sign in with phone and password")
def login(payload: LoginRequest, session: DbSession) -> TokenOut:
    user = session.scalar(select(User).where(User.phone == payload.phone))
    # Same error for unknown phone and wrong password: no account enumeration.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthError("INVALID_CREDENTIALS", "Phone number or password is incorrect.")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        session.commit()

    return _token_response(user)


@router.get("/me", response_model=UserOut, summary="Current profile")
def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut, summary="Update own profile")
def update_me(payload: ProfileUpdate, user: CurrentUser, session: DbSession) -> UserOut:
    data = payload.model_dump(exclude_unset=True)
    # The API field is `lang` (§14.2); the column is `language` (§14.6).
    if "lang" in data:
        user.language = data.pop("lang")
    for field in ("name", "email", "village", "district", "state"):
        if field in data:
            setattr(user, field, data[field])
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ConflictError("EMAIL_TAKEN", "This email is already in use.", field="email") from exc
    return UserOut.model_validate(user)
