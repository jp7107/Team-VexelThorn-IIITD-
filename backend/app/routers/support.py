"""Customer care tickets (plan §13.4; tasks BE-09, FE-10)."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import ratelimit
from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import current_user, require_role
from app.models import SupportTicket, User

router = APIRouter(tags=["support"])
admin = require_role("admin")


class TicketIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    subject: str
    message: str
    status: str
    created_at: datetime


class AdminTicketOut(TicketOut):
    user_name: str
    user_role: str
    # The person asked for help, so the admin may call them back.
    user_phone: str


@router.post("/support/tickets", status_code=201, response_model=TicketOut,
             dependencies=[Depends(ratelimit.per_user("tickets", (5, 3600)))])
def create_ticket(body: TicketIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ticket = SupportTicket(**body.model_dump(), user_id=user.id)
    db.add(ticket)
    db.commit()
    return ticket


@router.get("/me/support/tickets", response_model=list[TicketOut])
def my_tickets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(SupportTicket).where(SupportTicket.user_id == user.id).order_by(SupportTicket.created_at.desc())
    return db.scalars(q.limit(50)).all()


@router.get("/admin/support/tickets", response_model=list[AdminTicketOut])
def admin_tickets(status: Literal["open", "closed"] | None = None, user: User = Depends(admin),
                  db: Session = Depends(get_db)):
    q = select(SupportTicket, User).join(User, SupportTicket.user_id == User.id)
    if status:
        q = q.where(SupportTicket.status == status)
    rows = db.execute(q.order_by(SupportTicket.created_at.desc()).limit(200)).all()
    return [AdminTicketOut(id=t.id, subject=t.subject, message=t.message, status=t.status, created_at=t.created_at,
                           user_name=u.name, user_role=u.role, user_phone=u.phone) for t, u in rows]


class TicketPatch(BaseModel):
    status: Literal["open", "closed"]


@router.patch("/admin/support/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: UUID, body: TicketPatch, user: User = Depends(admin), db: Session = Depends(get_db)):
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise AppError(404, "Ticket not found")
    ticket.status = body.status
    db.commit()
    return ticket
