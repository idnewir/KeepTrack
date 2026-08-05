"""Log viewer endpoints: audit log (active + permanent archive) and the
rolling 90-day error log. Admin and Superadmin only, per the task brief.
"""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Query, Session

from database import get_db
from models.audit_log import AuditLog, AuditLogArchive
from models.error_log import ErrorLog
from models.schemas import ArchiveNowOut, AuditLogOut, ErrorLogOut, LogsStatusOut, PaginatedResponse
from models.user import User
from services import maintenance_service
from utils.csv_export import csv_response
from utils.deps import require_admin
from utils.pagination import paginate

router = APIRouter(prefix="/logs", tags=["logs"])


def _day_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    start = datetime.combine(date_from, time.min, tzinfo=timezone.utc) if date_from else None
    end = datetime.combine(date_to, time.max, tzinfo=timezone.utc) if date_to else None
    return start, end


def _filtered_audit_query(
    db: Session,
    model,
    user_id: int | None,
    action_type: str | None,
    date_from: date | None,
    date_to: date | None,
) -> Query:
    query = db.query(model)
    if user_id is not None:
        query = query.filter(model.user_id == user_id)
    if action_type:
        query = query.filter(model.action_type == action_type)
    start, end = _day_bounds(date_from, date_to)
    if start is not None:
        query = query.filter(model.created_at >= start)
    if end is not None:
        query = query.filter(model.created_at <= end)
    return query.order_by(model.created_at.desc())


def _user_display_names(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    return {u.id: (u.display_name or u.username) for u in users}


def _audit_to_out(row, names: dict[int, str]) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "user_display_name": names.get(row.user_id) if row.user_id else None,
        "action_type": row.action_type,
        "description": row.description,
        "affected_table": row.affected_table,
        "affected_record_id": row.affected_record_id,
        "metadata": row.extra_metadata,
        "ip_address": row.ip_address,
        "created_at": row.created_at,
    }


def _audit_rows_to_out(db: Session, rows: list) -> list[dict]:
    names = _user_display_names(db, {r.user_id for r in rows if r.user_id})
    return [_audit_to_out(r, names) for r in rows]


@router.get("/audit", response_model=PaginatedResponse[AuditLogOut])
def list_audit_log(
    user_id: int | None = None,
    action_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = _filtered_audit_query(db, AuditLog, user_id, action_type, date_from, date_to)
    items, pagination = paginate(query, page, per_page)
    return {"data": _audit_rows_to_out(db, items), "pagination": pagination}


@router.get("/audit/archive", response_model=PaginatedResponse[AuditLogOut])
def list_audit_log_archive(
    user_id: int | None = None,
    action_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = _filtered_audit_query(db, AuditLogArchive, user_id, action_type, date_from, date_to)
    items, pagination = paginate(query, page, per_page)
    return {"data": _audit_rows_to_out(db, items), "pagination": pagination}


@router.get("/audit/export/csv")
def export_audit_log_csv(
    user_id: int | None = None,
    action_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    include_archive: bool = False,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    model = AuditLogArchive if include_archive else AuditLog
    rows = _filtered_audit_query(db, model, user_id, action_type, date_from, date_to).all()
    names = _user_display_names(db, {r.user_id for r in rows if r.user_id})

    csv_rows = [
        [
            r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            names.get(r.user_id, "System") if r.user_id else "System",
            r.action_type,
            r.description,
            r.affected_table or "",
            r.affected_record_id or "",
            r.ip_address or "",
        ]
        for r in rows
    ]
    filename = "audit_log_archive_export.csv" if include_archive else "audit_log_export.csv"
    return csv_response(
        filename,
        ["Timestamp", "User", "Action", "Description", "Affected Table", "Affected Record ID", "IP Address"],
        csv_rows,
    )


@router.get("/errors", response_model=PaginatedResponse[ErrorLogOut])
def list_error_log(
    severity: str | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = db.query(ErrorLog)
    if severity:
        query = query.filter(ErrorLog.severity == severity)
    if source:
        query = query.filter(ErrorLog.source == source)
    start, end = _day_bounds(date_from, date_to)
    if start is not None:
        query = query.filter(ErrorLog.created_at >= start)
    if end is not None:
        query = query.filter(ErrorLog.created_at <= end)
    query = query.order_by(ErrorLog.created_at.desc())

    items, pagination = paginate(query, page, per_page)
    names = _user_display_names(db, {r.user_id for r in items if r.user_id})
    data = [
        {
            "id": r.id,
            "severity": r.severity,
            "source": r.source,
            "message": r.message,
            "stack_trace": r.stack_trace,
            "request_path": r.request_path,
            "user_id": r.user_id,
            "user_display_name": names.get(r.user_id) if r.user_id else None,
            "created_at": r.created_at,
        }
        for r in items
    ]
    return {"data": data, "pagination": pagination}


@router.get("/errors/export/csv")
def export_error_log_csv(
    severity: str | None = None,
    source: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = db.query(ErrorLog)
    if severity:
        query = query.filter(ErrorLog.severity == severity)
    if source:
        query = query.filter(ErrorLog.source == source)
    start, end = _day_bounds(date_from, date_to)
    if start is not None:
        query = query.filter(ErrorLog.created_at >= start)
    if end is not None:
        query = query.filter(ErrorLog.created_at <= end)
    rows = query.order_by(ErrorLog.created_at.desc()).all()

    csv_rows = [
        [
            r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            r.severity,
            r.source,
            r.message,
            r.request_path or "",
        ]
        for r in rows
    ]
    return csv_response(
        "error_log_export.csv",
        ["Timestamp", "Severity", "Source", "Message", "Request Path"],
        csv_rows,
    )


def _build_status(db: Session) -> dict:
    last_archive = maintenance_service.get_last_run(db, maintenance_service.LAST_ARCHIVE_RUN_KEY)
    last_cleanup = maintenance_service.get_last_run(db, maintenance_service.LAST_ERROR_CLEANUP_RUN_KEY)

    interval = timedelta(days=maintenance_service.AUDIT_LOG_RETENTION_DAYS)
    cleanup_interval = timedelta(days=maintenance_service.ERROR_LOG_RETENTION_DAYS)

    return {
        "audit_log_count": db.query(AuditLog).count(),
        "audit_log_archive_count": db.query(AuditLogArchive).count(),
        "error_log_count": db.query(ErrorLog).count(),
        "last_archive_run": last_archive,
        "next_archive_run": (last_archive + interval) if last_archive else None,
        "last_error_cleanup_run": last_cleanup,
        "next_error_cleanup_run": (last_cleanup + cleanup_interval) if last_cleanup else None,
    }


@router.get("/status", response_model=LogsStatusOut)
def logs_status(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return _build_status(db)


@router.post("/audit/archive", response_model=ArchiveNowOut)
def archive_audit_log_now(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Manual "Archive now" button — not in the task brief's literal
    endpoint list (which only specified GETs), but the FRONTEND section
    explicitly requires an "Archive now" button that "triggers manual
    archive immediately", which has nothing to call without this. See
    docs/decisions-log.md."""
    archived_count = maintenance_service.archive_old_audit_logs(db)
    return {"archived_count": archived_count, **_build_status(db)}
