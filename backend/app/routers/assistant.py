from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, StringConstraints, model_validator
from sqlalchemy.orm import Session

from app.assistant import chat
from app.core import ratelimit
from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import current_user
from app.models import Analysis, User

router = APIRouter(prefix="/assistant", tags=["assistant"])


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class ChatIn(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=10)  # last 10 turns only (plan §11.2)
    language: Literal["en", "hi"]
    analysis_id: UUID | None = None

    @model_validator(mode="after")
    def _ends_with_user(self):
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return self


class Evidence(BaseModel):
    type: Literal["ml_prediction", "db_record", "kb_article", "llm_general"]
    ref: str | None
    label: str
    url: str | None


class ChatOut(BaseModel):
    answer: str
    language: str
    route: Literal["A", "B", "C", "D", "E", "F", "G", "H"]
    evidence: list[Evidence]
    uncertainty: Literal["low", "medium", "high", "unknown"]
    follow_up_questions: list[str]
    safety_notes: list[str]
    llm_status: Literal["ok", "fallback"]


@router.post("/chat", response_model=ChatOut,
             dependencies=[Depends(ratelimit.per_user("chat", (10, 60), (100, 86400)))])
def assistant_chat(body: ChatIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    analysis = None
    if body.analysis_id:
        analysis = db.get(Analysis, body.analysis_id)
        if analysis is None or analysis.farmer_id != user.id:
            raise AppError(404, "Analysis not found")
    turn = chat.respond(db, user, [m.model_dump() for m in body.messages], body.language, analysis,
                        getattr(request.state, "request_id", ""))
    return ChatOut(answer=turn.answer, language=turn.language, route=turn.route, evidence=turn.evidence,
                   uncertainty=turn.uncertainty, follow_up_questions=turn.follow_up_questions,
                   safety_notes=turn.safety_notes, llm_status=turn.llm_status)
