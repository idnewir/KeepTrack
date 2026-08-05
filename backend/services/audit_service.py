"""Shared audit-logging service — the single place every endpoint that
performs a recordable action writes to `audit_log`, so the logging call
and the shape of an entry stay consistent everywhere (see docs/decisions-log.md).

Not used for the `audit_log.archived` entry itself, which is written
directly into `audit_log_archive` by services/maintenance_service.py —
see that module's docstring for why.
"""
from sqlalchemy.orm import Session

from models.audit_log import AuditLog


def log_action(
    db: Session,
    action_type: str,
    description: str,
    user_id: int | None = None,
    affected_table: str | None = None,
    affected_record_id: int | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        affected_table=affected_table,
        affected_record_id=affected_record_id,
        extra_metadata=metadata,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
