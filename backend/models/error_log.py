"""Error log ORM model — a rolling, 90-day system error/warning log.

Auto-deleted after 90 days by services/maintenance_service.py. See
docs/decisions-log.md.
"""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, func

from database import Base

SEVERITIES = ("info", "warning", "error", "critical")


class ErrorLog(Base):
    __tablename__ = "error_log"
    __table_args__ = (
        CheckConstraint(f"severity IN {SEVERITIES}", name="ck_error_log_severity"),
    )

    id = Column(Integer, primary_key=True)
    severity = Column(String(20), nullable=False)
    source = Column(String(50), nullable=False)
    message = Column(String(1000), nullable=False)
    stack_trace = Column(Text, nullable=True)
    request_path = Column(String(255), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved = Column(Boolean, nullable=False, server_default="false")
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_note = Column(String(500), nullable=True)
