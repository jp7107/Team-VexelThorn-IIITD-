"""Schemes, agricultural updates and the knowledge base (plan §8.8-8.9, §14.3-14.4; tasks CNT-02, ADM-01).

Public reads show published schemes only. Everything is written by admins, and every scheme and KB article
carries an official https source and a last-verified date: the app never states scheme benefits on its own.
"""

from datetime import UTC, date, datetime
from typing import Annotated, Literal
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import current_user, require_role
from app.models import KbArticle, Listing, Scheme, Update, User
from app.routers.marketplace import ListingOut, listing_rows

router = APIRouter(tags=["content"])
admin = require_role("admin")


def _https(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("must be an https link")
    return url


HttpsUrl = Annotated[str, Field(max_length=500), AfterValidator(_https)]


# --- schemes ---

class SchemeIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=2000)
    eligibility_text: str = Field(min_length=1, max_length=2000)
    benefit_text: str | None = Field(None, max_length=2000)
    official_url: HttpsUrl
    states: list[Annotated[str, Field(min_length=1, max_length=60)]] = Field(default_factory=list, max_length=40)
    last_verified_at: date
    published: bool = False


class SchemePatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str | None = Field(None, min_length=1, max_length=200)
    summary: str | None = Field(None, min_length=1, max_length=2000)
    eligibility_text: str | None = Field(None, min_length=1, max_length=2000)
    benefit_text: str | None = Field(None, max_length=2000)
    official_url: HttpsUrl | None = None
    states: list[Annotated[str, Field(min_length=1, max_length=60)]] | None = Field(None, max_length=40)
    last_verified_at: date | None = None
    published: bool | None = None


class SchemeOut(SchemeIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


@router.get("/schemes", response_model=list[SchemeOut])
def list_schemes(state: str | None = Query(None, max_length=60), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    q = select(Scheme).where(Scheme.published.is_(True))
    if state:  # central schemes list no states
        q = q.where(or_(func.cardinality(Scheme.states) == 0, Scheme.states.any(state)))
    return db.scalars(q.order_by(Scheme.name)).all()


@router.get("/schemes/{scheme_id}", response_model=SchemeOut)
def get_scheme(scheme_id: UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None or (not scheme.published and user.role != "admin"):
        raise AppError(404, "Scheme not found")
    return scheme


@router.get("/admin/schemes", response_model=list[SchemeOut])
def admin_list_schemes(user: User = Depends(admin), db: Session = Depends(get_db)):
    return db.scalars(select(Scheme).order_by(Scheme.name)).all()


@router.post("/admin/schemes", status_code=201, response_model=SchemeOut)
def create_scheme(body: SchemeIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    scheme = Scheme(**body.model_dump())
    db.add(scheme)
    db.commit()
    return scheme


def _apply(obj, patch: BaseModel, required: tuple[str, ...]) -> None:
    for key, value in patch.model_dump(exclude_unset=True).items():
        if value is None and key in required:
            raise AppError(422, f"{key} cannot be empty")
        setattr(obj, key, value)


@router.patch("/admin/schemes/{scheme_id}", response_model=SchemeOut)
def update_scheme(scheme_id: UUID, body: SchemePatch, user: User = Depends(admin), db: Session = Depends(get_db)):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise AppError(404, "Scheme not found")
    _apply(scheme, body, ("name", "summary", "eligibility_text", "official_url", "states", "last_verified_at",
                          "published"))
    db.commit()
    return scheme


@router.delete("/admin/schemes/{scheme_id}", status_code=204)
def delete_scheme(scheme_id: UUID, user: User = Depends(admin), db: Session = Depends(get_db)):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise AppError(404, "Scheme not found")
    db.delete(scheme)
    db.commit()
    return Response(status_code=204)


# --- agricultural updates ---

class UpdateIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    source_url: HttpsUrl | None = None


class UpdateOut(UpdateIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    published_at: datetime


@router.get("/updates", response_model=list[UpdateOut])
def list_updates(limit: int = Query(20, ge=1, le=50), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    return db.scalars(select(Update).order_by(Update.published_at.desc()).limit(limit)).all()


@router.post("/admin/updates", status_code=201, response_model=UpdateOut)
def create_update(body: UpdateIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    update = Update(**body.model_dump(), author_id=user.id, published_at=datetime.now(UTC))
    db.add(update)
    db.commit()
    return update


@router.delete("/admin/updates/{update_id}", status_code=204)
def delete_update(update_id: UUID, user: User = Depends(admin), db: Session = Depends(get_db)):
    update = db.get(Update, update_id)
    if update is None:
        raise AppError(404, "Update not found")
    db.delete(update)
    db.commit()
    return Response(status_code=204)


# --- knowledge base ---

Topic = Literal["disease", "productivity", "irrigation", "general"]


class KbIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=8000)
    topic: Topic
    language: Literal["en", "hi"]
    disease_class_code: str | None = Field(None, max_length=60)
    crop_code: str | None = Field(None, max_length=30)
    source_name: str = Field(min_length=1, max_length=200)
    source_url: HttpsUrl


class KbOut(KbIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    verified_by: str
    verified_at: date


@router.get("/kb", response_model=list[KbOut])
def search_kb(q: str | None = Query(None, max_length=200), crop_code: str | None = Query(None, max_length=30),
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(KbArticle)
    if q:
        query = query.where(KbArticle.tsv.op("@@")(func.plainto_tsquery("simple", q)))
    if crop_code:
        query = query.where(KbArticle.crop_code == crop_code)
    return db.scalars(query.order_by(KbArticle.title).limit(50)).all()


@router.post("/admin/kb", status_code=201, response_model=KbOut)
def create_kb(body: KbIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    # Saving an article is the admin's statement that they checked it against the source today.
    article = KbArticle(**body.model_dump(), verified_by=user.name, verified_at=date.today())
    db.add(article)
    db.commit()
    db.refresh(article)  # tsv is computed by Postgres
    return article


@router.put("/admin/kb/{article_id}", response_model=KbOut)
def replace_kb(article_id: UUID, body: KbIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    article = db.get(KbArticle, article_id)
    if article is None:
        raise AppError(404, "Article not found")
    for key, value in body.model_dump().items():
        setattr(article, key, value)
    article.verified_by, article.verified_at = user.name, date.today()
    db.commit()
    db.refresh(article)
    return article


@router.delete("/admin/kb/{article_id}", status_code=204)
def delete_kb(article_id: UUID, user: User = Depends(admin), db: Session = Depends(get_db)):
    article = db.get(KbArticle, article_id)
    if article is None:
        raise AppError(404, "Article not found")
    db.delete(article)
    db.commit()
    return Response(status_code=204)


# --- moderation and users ---

@router.get("/admin/listings", response_model=list[ListingOut])
def admin_listings(status: Literal["open", "closed", "hidden"] | None = None, user: User = Depends(admin),
                   db: Session = Depends(get_db)):
    q = select(Listing).order_by(Listing.created_at.desc()).limit(200)
    if status:
        q = q.where(Listing.status == status)
    return listing_rows(db, list(db.scalars(q)), user)
