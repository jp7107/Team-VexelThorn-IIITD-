"""Whitelisted, read-only retrieval tools for the assistant (plan §11.1, task BE-07).

- The LLM picks a tool name and arguments; the principal (who is asking) always comes from the session.
- Arguments are validated by Pydantic; queries are parameterised SQLAlchemy; results carry allowed fields only.
- Marketplace listings and other users' data are never exposed (prompt-injection and privacy surface).
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.ml import inference
from app.models import Analysis, FarmCrop, KbArticle, MarketPrice, Scheme, User

FARMER_ONLY = frozenset({"farmer"})
EVERYONE = frozenset({"farmer", "customer", "admin"})
MAX_ROWS = 10
STATEMENT_TIMEOUT_MS = 3000  # plan §11.2: 3 s per tool


class NoArgs(BaseModel):
    model_config = {"extra": "forbid"}


class RecentArgs(BaseModel):
    model_config = {"extra": "forbid"}
    limit: int = Field(3, ge=1, le=5)


class DiseaseArgs(BaseModel):
    model_config = {"extra": "forbid"}
    class_code: str = Field(max_length=60)

    @field_validator("class_code")
    @classmethod
    def _known(cls, v: str) -> str:
        if v not in {c["code"] for c in inference.labels()}:
            raise ValueError("unknown class_code")
        return v


class SearchArgs(BaseModel):
    model_config = {"extra": "forbid"}
    query: str = Field(min_length=1, max_length=200)
    crop_code: str | None = Field(None, max_length=30)


class PriceArgs(BaseModel):
    model_config = {"extra": "forbid"}
    commodity: str = Field(min_length=1, max_length=60)
    state: str | None = Field(None, max_length=60)
    district: str | None = Field(None, max_length=60)


class SchemeArgs(BaseModel):
    model_config = {"extra": "forbid"}
    query: str = Field(min_length=1, max_length=200)
    state: str | None = Field(None, max_length=60)


def _like(value: str) -> str:
    """ILIKE pattern with the user's own wildcards escaped."""
    return "%" + value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"


def _name(code: str, lang: str) -> str:
    label = next((c for c in inference.labels() if c["code"] == code), None)
    return (label["name_hi"] if lang == "hi" else label["name_en"]) if label else code


def confidence_pct(confidence: float | None) -> int | None:
    """A model score as a percentage, capped at 99: never presented as certainty."""
    return None if confidence is None else min(99, round(confidence * 100))


def _kb_row(k: KbArticle) -> dict:
    return {"ref": f"kb:{k.id}", "title": k.title, "body": k.body[:1500], "source_name": k.source_name,
            "source_url": k.source_url}


def get_my_crops(db: Session, user: User, args: NoArgs, lang: str) -> list[dict]:
    rows = db.scalars(select(FarmCrop).where(FarmCrop.farmer_id == user.id).order_by(FarmCrop.created_at)
                      .limit(MAX_ROWS))
    return [{"ref": f"crop:{c.id}", "crop_code": c.crop_code, "variety": c.variety, "stage": c.stage,
             "sowing_date": c.sowing_date.isoformat(), "area_acres": float(c.area_acres)} for c in rows]


def get_my_recent_analyses(db: Session, user: User, args: RecentArgs, lang: str) -> list[dict]:
    rows = db.scalars(select(Analysis).where(Analysis.farmer_id == user.id)
                      .order_by(Analysis.created_at.desc()).limit(args.limit))
    return [{"ref": f"analysis:{a.id}", "crop": a.crop_code_claimed, "status": a.status,
             "disease": _name(a.predicted_class, lang) if a.predicted_class else None,
             "model_confidence_pct": confidence_pct(a.confidence), "date": a.created_at.date().isoformat(),
             "model_version": a.model_version}
            for a in rows]


def get_disease_info(db: Session, user: User, args: DiseaseArgs, lang: str) -> list[dict]:
    rows = db.scalars(select(KbArticle).where(KbArticle.disease_class_code == args.class_code).limit(3))
    return [_kb_row(k) for k in rows]


def search_knowledge(db: Session, user: User, args: SearchArgs, lang: str) -> list[dict]:
    q = select(KbArticle).where(KbArticle.tsv.op("@@")(func.plainto_tsquery("simple", args.query)))
    if args.crop_code:
        q = q.where(KbArticle.crop_code == args.crop_code)
    return [_kb_row(k) for k in db.scalars(q.limit(3))]


def get_market_prices(db: Session, user: User, args: PriceArgs, lang: str) -> list[dict]:
    q = select(MarketPrice).where(MarketPrice.commodity.ilike(_like(args.commodity)))
    if args.state:
        q = q.where(MarketPrice.state.ilike(_like(args.state)))
    if args.district:
        q = q.where(MarketPrice.district.ilike(_like(args.district)))
    rows = db.scalars(q.order_by(MarketPrice.arrival_date.desc()).limit(MAX_ROWS))
    return [{"ref": f"market_prices:{p.id}", "commodity": p.commodity, "variety": p.variety, "market": p.market,
             "district": p.district, "state": p.state, "arrival_date": p.arrival_date.isoformat(),
             "min_price": float(p.min_price), "max_price": float(p.max_price), "modal_price": float(p.modal_price),
             "unit": p.unit, "source": p.source, "is_demo": p.is_demo} for p in rows]


def search_schemes(db: Session, user: User, args: SchemeArgs, lang: str) -> list[dict]:
    pattern = _like(args.query)
    q = select(Scheme).where(Scheme.published.is_(True), or_(
        Scheme.name.ilike(pattern), Scheme.summary.ilike(pattern), Scheme.eligibility_text.ilike(pattern)))
    if args.state:  # central schemes have no states listed
        q = q.where(or_(func.cardinality(Scheme.states) == 0, Scheme.states.any(args.state)))
    return [{"ref": f"schemes:{s.id}", "name": s.name, "summary": s.summary, "eligibility": s.eligibility_text,
             "official_url": s.official_url, "last_verified": s.last_verified_at.isoformat()}
            for s in db.scalars(q.limit(5))]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    roles: frozenset[str]
    fn: Callable[[Session, User, BaseModel, str], list[dict]]


TOOLS = {t.name: t for t in [
    Tool("get_my_crops", "The farmer's saved crops: crop, variety, growth stage, sowing date, area.",
         NoArgs, FARMER_ONLY, get_my_crops),
    Tool("get_my_recent_analyses", "The farmer's latest leaf checks: status, disease found, confidence, date.",
         RecentArgs, FARMER_ONLY, get_my_recent_analyses),
    Tool("get_disease_info", "Verified articles about one disease class, e.g. tomato__early_blight.",
         DiseaseArgs, EVERYONE, get_disease_info),
    Tool("search_knowledge", "Search verified farming articles. Query in the article's language.",
         SearchArgs, EVERYONE, search_knowledge),
    Tool("get_market_prices", "Latest mandi prices for a commodity (English name, e.g. Tomato), optional state/district.",
         PriceArgs, EVERYONE, get_market_prices),
    Tool("search_schemes", "Published government schemes matching a query, optional state.",
         SchemeArgs, EVERYONE, search_schemes),
]}


def catalogue(role: str) -> list[dict]:
    """What the planner is told about: only tools this role may call."""
    return [{"name": t.name, "description": t.description, "args": t.args.model_json_schema().get("properties", {})}
            for t in TOOLS.values() if role in t.roles]


@dataclass
class ToolResult:
    name: str
    arg_keys: list[str]
    rows: list[dict]
    status: Literal["ok", "rejected"]


def run(db: Session, user: User, name: str, raw_args: object, lang: str) -> ToolResult:
    """Validates and runs one tool call. Unknown tools, wrong roles and bad arguments are rejected, never run."""
    arg_keys = sorted(raw_args) if isinstance(raw_args, dict) else []
    tool = TOOLS.get(name)
    if tool is None or user.role not in tool.roles:
        return ToolResult(name, arg_keys, [], "rejected")
    try:
        args = tool.args.model_validate(raw_args if isinstance(raw_args, dict) else {})
    except ValidationError:
        return ToolResult(name, arg_keys, [], "rejected")
    db.execute(text(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}"))
    return ToolResult(name, arg_keys, tool.fn(db, user, args, lang), "ok")
