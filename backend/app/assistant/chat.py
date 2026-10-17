"""Assistant chat (plan task LLM-03; routing paths A-H in plan §12).

One turn = plan call (which whitelisted tools to run) -> server runs them -> answer call grounded in their rows.
If the LLM is unavailable or misbehaves, a keyword router runs the same tools and answers from templates.
"""

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, ValidationError
from sqlalchemy.orm import Session

from app.assistant import llm, tools
from app.assistant.report import _name, _prompt, _template
from app.models import Analysis, AssistantAudit, User

log = logging.getLogger(__name__)
MAX_TOOL_CALLS = 4
Text300 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class PlannedCall(BaseModel):
    name: str = Field(max_length=60)
    args: dict = Field(default_factory=dict)


class Plan(BaseModel):
    tool_calls: list[PlannedCall] = Field(default_factory=list)
    follow_up_questions: list[Text300] = Field(default_factory=list)


class AnswerBody(BaseModel):
    answer: str = Field(min_length=1, max_length=2000)
    used_refs: list[str] = Field(default_factory=list, max_length=20)
    uncertainty: Literal["low", "medium", "high", "unknown"] = "unknown"
    follow_up_questions: list[Text300] = Field(default_factory=list)
    safety_notes: list[Text300] = Field(default_factory=list)


@dataclass
class Turn:
    answer: str
    language: str
    route: str
    evidence: list[dict]
    uncertainty: str
    follow_up_questions: list[str]
    safety_notes: list[str]
    llm_status: str
    tool_log: list[dict] = field(default_factory=list)


EVIDENCE_TYPE = {"kb": "kb_article", "analysis": "ml_prediction"}


def _evidence(results: list[tools.ToolResult], refs: set[str] | None) -> list[dict]:
    """Evidence from rows the tools really returned. `refs=None` means every returned row was used."""
    out, seen = [], set()
    for r in results:
        for row in r.rows:
            ref = row.get("ref")
            if ref and ref not in seen and (refs is None or ref in refs):
                seen.add(ref)
                label = row.get("title") or row.get("name") or row.get("market") or row.get("crop_code") \
                    or row.get("disease") or ref.split(":")[0]
                out.append({"type": EVIDENCE_TYPE.get(ref.split(":")[0], "db_record"), "ref": ref,
                            "label": label, "url": row.get("source_url") or row.get("official_url")})
    return out


def _analysis_data(a: Analysis | None, lang: str) -> dict | None:
    if a is None:
        return None
    return {"ref": f"analysis:{a.id}", "status": a.status, "crop": a.crop_code_claimed,
            "disease": _name(a.predicted_class, lang) if a.predicted_class else None,
            "model_confidence_pct": tools.confidence_pct(a.confidence)}


def _route(analysis: Analysis | None, results: list[tools.ToolResult], follow_ups: list[str], llm_ok: bool) -> str:
    if not llm_ok:
        return "F"
    if analysis is not None:
        return {"ok": "A", "uncertain": "B"}.get(analysis.status, "C")
    if follow_ups and not results:
        return "H"
    if any(r.status == "ok" and not r.rows for r in results):
        return "E"
    return "D"


def _llm_turn(db: Session, user: User, history: list[dict], lang: str, analysis: Analysis | None) -> Turn:
    system = _prompt("system_base")
    base = {"language": lang, "role": user.role, "conversation": history, "analysis": _analysis_data(analysis, lang)}

    plan = Plan.model_validate(llm.generate_json(system, _prompt("chat_plan").replace(
        "{data}", json.dumps({**base, "tools": tools.catalogue(user.role)}, ensure_ascii=False))))
    results = [tools.run(db, user, c.name, c.args, lang) for c in plan.tool_calls[:MAX_TOOL_CALLS]]

    if not results and plan.follow_up_questions:  # Path H: ask instead of guessing
        return Turn(answer=" ".join(plan.follow_up_questions), language=lang, route="H", evidence=[],
                    uncertainty="unknown", follow_up_questions=plan.follow_up_questions, safety_notes=[],
                    llm_status="ok", tool_log=[{"name": r.name, "arg_keys": r.arg_keys} for r in results])

    tool_results = [{"tool": r.name, "status": r.status, "rows": r.rows} for r in results]
    body = AnswerBody.model_validate(llm.generate_json(system, _prompt("chat_answer").replace(
        "{data}", json.dumps({**base, "tool_results": tool_results}, ensure_ascii=False))))

    evidence = _evidence(results, set(body.used_refs))
    if analysis is not None:
        evidence.insert(0, {"type": "ml_prediction", "ref": f"analysis:{analysis.id}",
                            "label": analysis.model_version, "url": None})
    # Without a verified article or record behind it, any advice in the answer is general advice.
    if not any(e["type"] in ("kb_article", "db_record") for e in evidence):
        evidence.append({"type": "llm_general", "ref": None, "label": "general guidance, not verified", "url": None})
    return Turn(answer=body.answer, language=lang,
                route=_route(analysis, results, body.follow_up_questions, True), evidence=evidence,
                uncertainty=body.uncertainty, follow_up_questions=body.follow_up_questions[:2],
                safety_notes=body.safety_notes[:2], llm_status="ok",
                tool_log=[{"name": r.name, "arg_keys": r.arg_keys} for r in results])


# --- deterministic fallback (plan §10.5) ---

PRICE_WORDS = ("भाव", "दाम", "कीमत", "मंडी", "price", "rate", "mandi")
SCHEME_WORDS = ("योजना", "स्कीम", "scheme", "yojana", "pm-kisan", "pm kisan", "बीमा", "insurance", "subsidy", "सब्सिडी")
ANALYSIS_WORDS = ("रोग", "बीमारी", "जाँच", "जांच", "रिपोर्ट", "disease", "diagnosis", "report", "leaf", "पत्ती")
CROP_WORDS = ("मेरी फसल", "फसलें", "my crop", "my crops")
COMMODITIES = {"Tomato": ("tomato", "टमाटर"), "Potato": ("potato", "आलू"), "Maize": ("maize", "corn", "मक्का")}


def _fallback_turn(db: Session, user: User, question: str, lang: str) -> Turn:
    t = _template(lang)["chat"]
    q = question.lower()
    has = lambda words: any(w in q for w in words)  # noqa: E731
    commodity = next((name for name, words in COMMODITIES.items() if any(w in q for w in words)), None)
    calls: list[tuple[str, dict, str, str]] = []  # tool, args, header key, "what" for no-record
    if has(PRICE_WORDS) and commodity:
        calls.append(("get_market_prices", {"commodity": commodity}, "prices",
                      t["what_prices"].format(commodity=commodity)))
    if has(SCHEME_WORDS):
        query = next((w for w in re.findall(r"[\w-]{4,}", question) if w.lower() not in SCHEME_WORDS), question[:60])
        calls.append(("search_schemes", {"query": query}, "schemes", t["what_schemes"]))
    if user.role == "farmer" and has(CROP_WORDS):
        calls.append(("get_my_crops", {}, "crops", t["what_crops"]))
    if user.role == "farmer" and has(ANALYSIS_WORDS):
        calls.append(("get_my_recent_analyses", {"limit": 3}, "analyses", t["what_analyses"]))

    lines, results = [], []
    for name, args, header, what in calls:
        r = tools.run(db, user, name, args, lang)
        results.append(r)
        if not r.rows:
            lines.append(t["no_record"].format(what=what))
            continue
        lines.append(t[header])
        for row in r.rows[:5]:
            if name == "get_market_prices":
                lines.append("• " + t["price_row"].format(
                    commodity=row["commodity"], market=row["market"], district=row["district"],
                    modal=f"{row['modal_price']:.0f}", unit_word=row["unit"].split("/")[-1], date=row["arrival_date"],
                    demo=t["demo"] if row["is_demo"] else ""))
            elif name == "search_schemes":
                lines.append("• " + t["scheme_row"].format(name=row["name"], url=row["official_url"]))
            elif name == "get_my_crops":
                lines.append("• " + t["crop_row"].format(crop=row["crop_code"], stage=row["stage"],
                                                         date=row["sowing_date"]))
            else:
                lines.append("• " + t["analysis_row"].format(date=row["date"], crop=row["crop"],
                                                             result=row["disease"] or t["result_none"]))
    found = any(r.rows for r in results)
    answer = "\n".join([t["unavailable"] if found else t["unavailable_nothing"], *lines])
    return Turn(answer=answer, language=lang, route="F", evidence=_evidence(results, None),
                uncertainty="unknown" if not found else "low", follow_up_questions=[], safety_notes=[],
                llm_status="fallback", tool_log=[{"name": r.name, "arg_keys": r.arg_keys} for r in results])


def respond(db: Session, user: User, history: list[dict], lang: str, analysis: Analysis | None,
            request_id: str) -> Turn:
    start = time.perf_counter()
    turn = None
    if llm.configured():
        try:
            turn = _llm_turn(db, user, history, lang, analysis)
        except llm.LLMRefusal:
            db.rollback()
            turn = Turn(answer=_template(lang)["chat"]["refusal"], language=lang, route="D", evidence=[],
                        uncertainty="unknown", follow_up_questions=[], safety_notes=[], llm_status="ok")
        except (llm.LLMError, ValidationError) as e:
            # The message names the failure (HTTP code, timeout, bad shape), never user content.
            log.warning("assistant LLM turn failed, using fallback: %s: %s", type(e).__name__, e)
            db.rollback()  # drop any half-run tool statements before the fallback runs its own
    if turn is None:
        turn = _fallback_turn(db, user, history[-1]["content"], lang)
    # Audit metadata only: route, tool names, argument keys, status, latency. Never message content.
    db.add(AssistantAudit(user_id=user.id, request_id=request_id[:64], route=turn.route, tools=turn.tool_log,
                          llm_status=turn.llm_status, latency_ms=round((time.perf_counter() - start) * 1000)))
    db.commit()
    return turn
