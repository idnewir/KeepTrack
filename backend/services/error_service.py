"""Shared error-logging service — the single place every caught exception or
failure condition in the backend writes to `error_log` (see
docs/decisions-log.md). Auto-cleaned after 90 days by
services/maintenance_service.py.
"""
from sqlalchemy.orm import Session

from models.error_log import SEVERITIES, ErrorLog

_MESSAGE_MAX_LENGTH = 1000


def log_error(
    db: Session,
    severity: str,
    source: str,
    message: str,
    stack_trace: str | None = None,
    request_path: str | None = None,
    user_id: int | None = None,
) -> ErrorLog:
    if severity not in SEVERITIES:
        severity = "error"

    entry = ErrorLog(
        severity=severity,
        source=source,
        message=message[:_MESSAGE_MAX_LENGTH],
        stack_trace=stack_trace,
        request_path=request_path,
        user_id=user_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
