"""Notification ORM model — persistent, per-user notification centre entries.

Unlike routers/dashboard.py's own notification banners (computed live on
every request, never stored — see docs/decisions-log.md's 2026-08-04 main
dashboard build entry), rows in this table are discrete, dismissable events
written by services/notification_service.py so a user can see and manage
them from the header notification bell on any page, not just the dashboard.
See docs/decisions-log.md for why both now coexist.
"""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, func

from database import Base

SEVERITIES = ("info", "warning", "error", "critical")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(f"severity IN {SEVERITIES}", name="ck_notifications_severity"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    link = Column(String(500), nullable=True)
    severity = Column(String(20), nullable=False, default="info", server_default="info")
    read = Column(Boolean, nullable=False, default=False, server_default="false")
    dismissed = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)
