"""System event ORM model — a permanent, never-truncated audit log.

Currently written only by the system reset feature (see routers/system.py
and services/system_reset_service.py), which logs every reset attempt
(successful, rejected, or rate-limited) here before anything is deleted.
Unlike every other table in the app, this one is explicitly exempt from
the reset it records — see docs/decisions-log.md.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from database import Base


class SystemEvent(Base):
    __tablename__ = "system_events"

    id = Column(Integer, primary_key=True)
    event_type = Column(String(50), nullable=False)
    # Nullable per the task brief — no actor is expected in practice (the
    # Superadmin performing/attempting a reset is never itself deleted), but
    # nothing here requires a real user row to exist.
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    details = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
