"""Farmer report for one analysis (plan §10.2-10.3, §12 paths A-C, F, G).

Evidence separation is enforced in code, not only in the prompt:
- the `result` block (class, confidence, model) is copied from the stored analysis; the LLM never writes it;
- symptoms are only kept when a verified KB article was supplied;
- an action may only cite a KB ref we actually supplied; anything else is labelled general advice;
- dose-like advice without a KB citation is dropped.
"""

import json
import logging
import re
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assistant import llm
from app.ml import inference
from app.models import Analysis, KbArticle

log = logging.getLogger(__name__)
HERE = Path(__file__).parent
Lang = Literal["en", "hi"]
Text300 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
# Numbers with a unit or a percentage, in English or Hindi: "2 ml", "2.5 g/l", "10%", "20 ग्राम".
DOSE_RE = re.compile(r"\d+(\.\d+)?\s*(ml|mL|g\b|gm|gram|kg|l\b|litre|liter|%|ppm|मिली|ग्राम|किलो|लीटर)", re.IGNORECASE)
LLM_STATUSES = {"ok", "uncertain"}  # other statuses have nothing for an LLM to explain


class Action(BaseModel):
    text: Text300
    evidence_ref: str | None = None


class ReportBody(BaseModel):
    """The part of the report the LLM (or the template) writes."""
    summary: str = Field(min_length=1, max_length=600)
    symptoms_to_check: list[Text300] = Field(default_factory=list, max_length=5)
    what_this_means: str = Field(min_length=1, max_length=600)
    info_needed: list[Text300] = Field(default_factory=list, max_length=5)
    recommended_actions: list[Action] = Field(default_factory=list, max_length=5)
    safety_notes: list[Text300] = Field(default_factory=list, max_length=5)


@lru_cache
def _template(lang: str) -> dict:
    return json.loads((HERE / "templates" / f"{lang}.json").read_text(encoding="utf-8"))


@lru_cache
def _prompt(name: str) -> str:
    return (HERE / "prompts" / f"{name}.md").read_text(encoding="utf-8")


def _labels() -> dict[str, dict]:
    return {c["code"]: c for c in inference.labels()}


def _name(code: str, lang: str) -> str:
    label = _labels().get(code)
    if not label:
        return code
    return label["name_hi"] if lang == "hi" else label["name_en"]


def _articles(db: Session, a: Analysis, lang: str) -> list[KbArticle]:
    if a.status != "ok" or not a.predicted_class:
        return []
    rows = db.scalars(select(KbArticle).where(KbArticle.disease_class_code == a.predicted_class)).all()
    return ([r for r in rows if r.language == lang] or list(rows))[:2]


def _template_body(a: Analysis, articles: list[KbArticle], lang: str) -> ReportBody:
    t = _template(lang)
    crop = t["crops"].get(a.crop_code_claimed, a.crop_code_claimed)
    pct = min(99, round((a.confidence or 0) * 100))
    healthy = bool(a.predicted_class and _labels().get(a.predicted_class, {}).get("is_healthy"))
    actions: list[Action] = []
    if a.status == "ok":
        key = "ok_healthy" if healthy else "ok_diseased"
        summary = t["summary"][key].format(name=_name(a.predicted_class, lang), crop=crop, pct=pct)
        meaning, info = t["meaning"]["ok"], [] if healthy else t["info_needed"]["ok_diseased"]
        if healthy:
            actions.append(Action(text=t["actions"]["healthy"]))
        elif articles:
            actions += [Action(text=t["actions"]["read_kb"].format(title=k.title), evidence_ref=f"kb:{k.id}")
                        for k in articles]
        else:
            actions.append(Action(text=t["actions"]["no_kb"]))
    elif a.status == "uncertain":
        possible = ", ".join(_name(k["class_code"], lang) for k in a.top_k)
        summary, meaning, info = t["summary"]["uncertain"].format(possible=possible), t["meaning"]["uncertain"], \
            t["info_needed"]["uncertain"]
        actions.append(Action(text=t["actions"]["retake"]))
    else:
        summary, meaning = t["summary"][a.status], t["meaning"]["other"]
        info = t["info_needed"]["retake"] if a.status in ("rejected_quality", "error") else []
        if a.status in ("rejected_quality", "error"):
            actions.append(Action(text=t["actions"]["retake"]))
    return ReportBody(summary=summary, what_this_means=meaning, info_needed=info, recommended_actions=actions,
                      symptoms_to_check=[], safety_notes=[t["safety"]])


def _llm_body(a: Analysis, articles: list[KbArticle], lang: str) -> ReportBody:
    t = _template(lang)
    data = {
        "language": lang,
        "crop": t["crops"].get(a.crop_code_claimed, a.crop_code_claimed),
        "status": a.status,
        "model_result": None if not a.predicted_class else {
            "disease": _name(a.predicted_class, lang),
            "is_healthy": _labels().get(a.predicted_class, {}).get("is_healthy", False),
            "confidence_pct": min(99, round((a.confidence or 0) * 100)),
        },
        "possibilities": [_name(k["class_code"], lang) for k in a.top_k] if a.status == "uncertain" else [],
        "kb_articles": [{"ref": f"kb:{k.id}", "title": k.title, "body": k.body[:1500], "source": k.source_name}
                        for k in articles],
    }
    raw = llm.generate_json(_prompt("system_base"),
                            _prompt("report").replace("{data}", json.dumps(data, ensure_ascii=False, indent=1)))
    body = ReportBody.model_validate(raw)

    allowed = {f"kb:{k.id}" for k in articles}
    actions = []
    for act in body.recommended_actions:
        ref = act.evidence_ref if act.evidence_ref in allowed else None
        if ref is None and DOSE_RE.search(act.text):
            log.warning("dropped uncited dose-like advice from LLM report (analysis %s)", a.id)
            continue
        actions.append(Action(text=act.text, evidence_ref=ref))
    return body.model_copy(update={
        "recommended_actions": actions,
        "symptoms_to_check": body.symptoms_to_check if articles else [],
        # The standard safety line always comes first, whatever the model wrote.
        "safety_notes": [t["safety"], *[n for n in body.safety_notes if n != t["safety"]]][:5],
    })


def build(db: Session, a: Analysis, lang: Lang) -> dict:
    """Returns the report fields to store: content, evidence, llm_status, llm_model."""
    articles = _articles(db, a, lang)
    llm_status, llm_model = "fallback", None
    body = None
    if a.status in LLM_STATUSES and llm.configured():
        try:
            body = _llm_body(a, articles, lang)
            llm_status, llm_model = "ok", llm.model_name()
        except (llm.LLMError, ValidationError) as e:
            log.warning("LLM report failed, using template (analysis %s): %s", a.id, type(e).__name__)
    if body is None:
        body = _template_body(a, articles, lang)

    label = _labels().get(a.predicted_class or "")
    healthy = bool(label and label["is_healthy"])
    evidence = []
    if a.predicted_class:
        evidence.append({"type": "ml_prediction", "ref": f"analysis:{a.id}", "label": a.model_version, "url": None})
    evidence += [{"type": "kb_article", "ref": f"kb:{k.id}", "label": k.source_name, "url": k.source_url}
                 for k in articles]
    if llm_status == "ok" and any(act.evidence_ref is None for act in body.recommended_actions):
        evidence.append({"type": "llm_general", "ref": None, "label": "general guidance, not verified", "url": None})

    content = {
        "image_ref": f"analysis:{a.id}",
        "crop": a.crop_code_claimed,
        "result": {
            "status": a.status,
            "class_code": a.predicted_class,
            "display_name": _name(a.predicted_class, lang) if a.predicted_class else None,
            "confidence": a.confidence,
            "model_version": a.model_version,
            "provenance": a.model_provenance,
        },
        **body.model_dump(),
        "consult_expert": not (a.status == "ok" and healthy),
        "sources": [{"name": k.source_name, "url": k.source_url} for k in articles],
        "generated_at": datetime.now(UTC).isoformat(),
        "llm_status": llm_status,
    }
    return {"content": content, "evidence": evidence, "llm_status": llm_status, "llm_model": llm_model}
