"""Audit log ORM models.

Two tables, identical structure: `audit_log` (active, last 90 days) and
`audit_log_archive` (permanent, never purged). Kept as two separate model
classes rather than a shared mixin/single-table-with-a-flag, matching this
project's existing preference for explicit duplication over cross-cutting
abstraction for tables (see e.g. DEFAULT_CATEGORIES/DEFAULT_SETTINGS in
services/system_reset_service.py). See docs/decisions-log.md.

The Python attribute is `extra_metadata`, not `metadata` — SQLAlchemy's
declarative Base reserves `metadata` for its own MetaData object, so the
column (named `metadata` in the database, per the task brief) is mapped
under a different attribute name.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String(50), nullable=False)
    description = Column(String(500), nullable=False)
    affected_table = Column(String(100), nullable=True)
    affected_record_id = Column(Integer, nullable=True)
    extra_metadata = Column("metadata", JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AuditLogArchive(Base):
    __tablename__ = "audit_log_archive"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String(50), nullable=False)
    description = Column(String(500), nullable=False)
    affected_table = Column(String(100), nullable=True)
    affected_record_id = Column(Integer, nullable=True)
    extra_metadata = Column("metadata", JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
