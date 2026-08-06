"""Background retention maintenance: quarterly audit log archiving and
90-day error log cleanup.

Runs once at app startup (called directly from main.py's startup event) and
then every 90 days via a lightweight daemon thread — no extra infrastructure
(APScheduler, Celery, cron) needed for a task that only has to fire a
handful of times a year. See docs/decisions-log.md.

`last_audit_archive_run` / `last_error_cleanup_run` are stored as ordinary
rows in the existing `settings` key/value table (like every other piece of
site configuration) rather than new dedicated columns/tables — they're read
back by routers/logs.py (GET /logs/status) and routers/dashboard.py (the
"Admin notification after completion" the task brief asks for is
implemented as a live dashboard notification shown for a short window after
last_audit_archive_run, following this app's existing pattern of computing
dashboard notifications live rather than storing them — see
docs/decisions-log.md's 2026-08-04 main dashboard build entry).

The summary `AuditLogArchive` row written by `archive_old_audit_logs` always
records that the task ran (`entries_archived` in `extra_metadata`), even
when zero entries were archived — but routers/dashboard.py only turns that
row into a dashboard notification when the count is greater than zero, so
an empty run stays silent on the dashboard. See docs/decisions-log.md.
"""
import logging
import threading
import time
import traceback
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from database import SessionLocal
from models.audit_log import AuditLog, AuditLogArchive
from models.error_log import ErrorLog
from models.setting import Setting
from services import audit_service, backup_service, error_service

logger = logging.getLogger("keep_track.maintenance")

AUDIT_LOG_RETENTION_DAYS = 90
ERROR_LOG_RETENTION_DAYS = 90
MAINTENANCE_INTERVAL_SECONDS = 90 * 24 * 60 * 60  # 90 days
BACKUP_CHECK_INTERVAL_SECONDS = 5 * 60  # 5 minutes — see run_scheduled_backup_check

LAST_ARCHIVE_RUN_KEY = "last_audit_archive_run"
LAST_ERROR_CLEANUP_RUN_KEY = "last_error_cleanup_run"


def _set_setting(db: Session, key: str, value: str) -> None:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None:
        setting = Setting(key=key)
        db.add(setting)
    setting.value = value


def get_last_run(db: Session, key: str) -> datetime | None:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None or not setting.value:
        return None
    return datetime.fromisoformat(setting.value)


def archive_old_audit_logs(db: Session) -> int:
    """Moves every audit_log entry older than 90 days into audit_log_archive,
    then records the archive event itself directly into audit_log_archive
    (not audit_log) — the archiving action describes something that just
    happened to the archive, and writing it anywhere else would just mean
    it gets swept into the archive itself on the very next run."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=AUDIT_LOG_RETENTION_DAYS)
    old_entries = db.query(AuditLog).filter(AuditLog.created_at < cutoff).all()
    count = len(old_entries)

    for entry in old_entries:
        db.add(AuditLogArchive(
            user_id=entry.user_id,
            action_type=entry.action_type,
            description=entry.description,
            affected_table=entry.affected_table,
            affected_record_id=entry.affected_record_id,
            extra_metadata=entry.extra_metadata,
            ip_address=entry.ip_address,
            created_at=entry.created_at,
        ))
        db.delete(entry)

    today = date.today()
    db.add(AuditLogArchive(
        action_type="audit_log.archived",
        description=f"audit_log.archived: {count} entries archived on {today.isoformat()}",
        extra_metadata={"entries_archived": count},
    ))

    _set_setting(db, LAST_ARCHIVE_RUN_KEY, datetime.now(timezone.utc).isoformat())
    db.commit()
    return count


def cleanup_old_error_logs(db: Session) -> int:
    """Deletes every error_log entry older than 90 days and records the
    cleanup action to audit_log (a system action — no acting user)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=ERROR_LOG_RETENTION_DAYS)
    count = db.query(ErrorLog).filter(ErrorLog.created_at < cutoff).count()
    db.query(ErrorLog).filter(ErrorLog.created_at < cutoff).delete(synchronize_session=False)

    _set_setting(db, LAST_ERROR_CLEANUP_RUN_KEY, datetime.now(timezone.utc).isoformat())
    db.commit()

    today = date.today()
    audit_service.log_action(
        db,
        action_type="error_log.cleaned",
        description=f"error_log.cleaned: {count} entries deleted on {today.isoformat()}",
    )
    return count


def run_maintenance_tasks(db: Session) -> dict:
    """Runs both retention jobs. Each is independently wrapped so a failure
    in one doesn't block the other, and any failure is itself recorded to
    error_log (source='background_task') rather than silently vanishing."""
    result = {"archived": 0, "cleaned": 0}

    try:
        result["archived"] = archive_old_audit_logs(db)
    except Exception as exc:
        logger.exception("Audit log archiving failed")
        db.rollback()
        error_service.log_error(
            db, "error", "background_task",
            f"Audit log archiving failed: {exc}",
            stack_trace=traceback.format_exc(),
        )

    try:
        result["cleaned"] = cleanup_old_error_logs(db)
    except Exception as exc:
        logger.exception("Error log cleanup failed")
        db.rollback()
        error_service.log_error(
            db, "error", "background_task",
            f"Error log cleanup failed: {exc}",
            stack_trace=traceback.format_exc(),
        )

    return result


def run_maintenance_once() -> dict:
    """Opens its own session — used by the startup hook and the background
    thread, neither of which has a request-scoped session to reuse."""
    db = SessionLocal()
    try:
        return run_maintenance_tasks(db)
    finally:
        db.close()


def _scheduler_loop() -> None:
    while True:
        time.sleep(MAINTENANCE_INTERVAL_SECONDS)
        try:
            run_maintenance_once()
        except Exception:
            logger.exception("Maintenance scheduler iteration failed")


def start_scheduler() -> None:
    """Starts the 90-day background thread. Does not run the tasks
    immediately — call run_maintenance_once() once at startup for that, so
    the two never race on the same first run."""
    thread = threading.Thread(target=_scheduler_loop, daemon=True)
    thread.start()


def run_scheduled_backup_check(db: Session) -> bool:
    """Runs a scheduled (daily/weekly/monthly) backup if one is due right
    now, per backup_service.should_run_scheduled_backup. Applies retention
    afterwards and records success/failure — this app has no outbound
    email, so "Admin notification" is the audit log (success) plus the
    error log (failure), the same two places every other background
    failure in this file already surfaces to Admins. See
    docs/decisions-log.md."""
    if not backup_service.should_run_scheduled_backup(db):
        return False

    try:
        result = backup_service.perform_backup(db, "scheduled", None, None)
    except Exception as exc:
        logger.exception("Scheduled backup failed")
        db.rollback()
        error_service.log_error(
            db, "critical", "scheduled_backup", f"Scheduled backup failed: {exc}",
            stack_trace=traceback.format_exc(),
        )
        return False

    deleted = backup_service.apply_retention(db)
    audit_service.log_action(
        db, "backup.created",
        f"Scheduled backup created ('{result['filename']}', "
        f"{result['size_bytes']} bytes){f', {deleted} old backup(s) removed under retention' if deleted else ''}",
        metadata={"filename": result["filename"], "size_bytes": result["size_bytes"], "retention_deleted": deleted},
    )
    return True


def _backup_scheduler_loop() -> None:
    while True:
        time.sleep(BACKUP_CHECK_INTERVAL_SECONDS)
        db = SessionLocal()
        try:
            run_scheduled_backup_check(db)
        except Exception:
            logger.exception("Backup scheduler iteration failed")
        finally:
            db.close()


def start_backup_scheduler() -> None:
    """Starts the backup-schedule-checking background thread. Checked every
    5 minutes (not just once at 2am) so a due backup still runs even if the
    app was restarted or briefly down across 2am — see
    should_run_scheduled_backup's own same-day guard for why this can't
    double-run within one day."""
    thread = threading.Thread(target=_backup_scheduler_loop, daemon=True)
    thread.start()
