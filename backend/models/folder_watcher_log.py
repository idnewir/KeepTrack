"""Folder watcher log ORM model — one row per input-folder file the
watcher has seen (services/folder_watcher_service.py), across every stage
from first detection through to completion, skip, or failure. Powers
GET /folder/status (last 20) and GET /folder/log (paginated). Not auto-
purged like audit_log/error_log — see docs/decisions-log.md.
"""
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, func

from database import Base

STATUSES = (
    "detected", "processing", "completed", "skipped",
    "failed", "duplicate_flagged", "duplicate_overridden",
)


class FolderWatcherLog(Base):
    __tablename__ = "folder_watcher_log"
    __table_args__ = (
        CheckConstraint(f"status IN {STATUSES}", name="ck_folder_watcher_log_status"),
    )

    id = Column(Integer, primary_key=True)
    event_type = Column(String(50), nullable=False)
    filename = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False)
    message = Column(String(1000), nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
