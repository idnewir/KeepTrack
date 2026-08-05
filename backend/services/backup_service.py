"""Full-system backup and restore.

A backup is a single zip file containing a `pg_dump` of the whole database
(everything — users, invoices, settings, audit log), every file under the
current storage root, and a `backup_manifest.json` describing both. See
docs/storage-and-backup.md for the user-facing walkthrough.

pg_dump/psql (postgresql-client-16, matching the postgres:16-alpine server —
see backend/Dockerfile) do the actual database dump/restore; this module
shells out to them rather than reimplementing dump/restore in Python, per
the task brief's explicit "PostgreSQL database dump (pg_dump)" requirement.
`pg_dump --clean --if-exists` plus `psql --single-transaction` means a
restore either fully replaces the database or, on any error, rolls back
completely rather than leaving a half-restored database — see
docs/decisions-log.md.

Maintenance mode is a plain module-level flag, checked by main.py's
middleware — not a separate table or cache, matching this project's existing
"no extra infrastructure for something a single boolean can do" pattern
(services/maintenance_service.py's own background thread is the same idea).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings as app_config
from database import SessionLocal, engine
from models.audit_log import AuditLog, AuditLogArchive
from models.category import Category
from models.contribution import Contribution
from models.error_log import ErrorLog
from models.financial_year import FinancialYear
from models.invoice import Invoice
from models.monthly_reconciliation import MonthlyReconciliation
from models.planned_project import PlannedProject
from models.report import Report
from models.setting import Setting
from models.user import User
from services import audit_service, storage_service
from utils.deps import JWT_INVALIDATE_BEFORE_KEY
from version import APP_VERSION

BACKUP_FORMAT = "keep-track-backup-v1"
MANIFEST_FILENAME = "backup_manifest.json"
DUMP_FILENAME = "database_dump.sql"

BACKUP_PATH_KEY = "backup_path"
BACKUP_SCHEDULE_KEY = "backup_schedule"
BACKUP_RETENTION_COUNT_KEY = "backup_retention_count"
LAST_BACKUP_DATE_KEY = "last_backup_date"
LAST_BACKUP_SIZE_KEY = "last_backup_size"

VALID_SCHEDULES = ("manual", "daily", "weekly", "monthly")
DEFAULT_RETENTION_COUNT = 5

# database_url is included here (not just its own field) because it embeds
# the database password — see _env_snapshot below.
_SECRET_CONFIG_FIELDS = {
    "database_url",
    "jwt_secret",
    "mfa_encryption_key",
    "superadmin_password",
    "anthropic_api_key",
}

_BACKUP_FILENAME_RE = re.compile(r"^keeptrack-backup-(manual|scheduled)-(\d{8}-\d{6})\.zip$")

# --------------------------------------------------------------------------
# Maintenance mode
# --------------------------------------------------------------------------

_maintenance_mode = False


def maintenance_mode_active() -> bool:
    return _maintenance_mode


def enter_maintenance_mode() -> None:
    global _maintenance_mode
    _maintenance_mode = True


def exit_maintenance_mode() -> None:
    global _maintenance_mode
    _maintenance_mode = False


# --------------------------------------------------------------------------
# Settings helpers
# --------------------------------------------------------------------------


def _setting_value(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row is not None else None


def _set_setting(db: Session, key: str, value: str | None, updated_by: int | None = None) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        row = Setting(key=key)
        db.add(row)
    row.value = value
    if updated_by is not None:
        row.updated_by = updated_by


def get_backup_path(db: Session) -> str | None:
    return _setting_value(db, BACKUP_PATH_KEY)


def get_backup_schedule(db: Session) -> str:
    value = _setting_value(db, BACKUP_SCHEDULE_KEY)
    return value if value in VALID_SCHEDULES else "manual"


def get_backup_retention_count(db: Session) -> int:
    value = _setting_value(db, BACKUP_RETENTION_COUNT_KEY)
    try:
        return max(1, int(value)) if value else DEFAULT_RETENTION_COUNT
    except (TypeError, ValueError):
        return DEFAULT_RETENTION_COUNT


def get_last_backup_info(db: Session) -> tuple[datetime | None, int | None]:
    date_value = _setting_value(db, LAST_BACKUP_DATE_KEY)
    size_value = _setting_value(db, LAST_BACKUP_SIZE_KEY)
    last_date = datetime.fromisoformat(date_value) if date_value else None
    last_size = int(size_value) if size_value else None
    return last_date, last_size


def set_backup_schedule(
    db: Session, schedule: str, backup_path: str | None, retention_count: int, actor_id: int | None
) -> None:
    if schedule not in VALID_SCHEDULES:
        raise ValueError(f"Schedule must be one of: {', '.join(VALID_SCHEDULES)}")
    if schedule != "manual":
        if not backup_path:
            raise ValueError("A backup destination path is required for scheduled backups")
        try:
            storage_service.check_path_writable(backup_path)
        except OSError as exc:
            raise ValueError(f"Backup destination path is not writable: {exc}") from exc
    if retention_count < 1:
        raise ValueError("Retention count must be at least 1")

    _set_setting(db, BACKUP_SCHEDULE_KEY, schedule, actor_id)
    _set_setting(db, BACKUP_PATH_KEY, backup_path, actor_id)
    _set_setting(db, BACKUP_RETENTION_COUNT_KEY, str(retention_count), actor_id)
    db.commit()


def next_scheduled_run(db: Session) -> datetime | None:
    schedule = get_backup_schedule(db)
    if schedule == "manual":
        return None
    now = datetime.now(timezone.utc)
    candidate = now.replace(hour=2, minute=0, second=0, microsecond=0)
    if schedule == "daily":
        if candidate <= now:
            candidate += timedelta(days=1)
    elif schedule == "weekly":
        days_ahead = (6 - candidate.weekday()) % 7  # next Sunday (6)
        candidate += timedelta(days=days_ahead)
        if candidate <= now:
            candidate += timedelta(days=7)
    elif schedule == "monthly":
        candidate = candidate.replace(day=1)
        if candidate <= now:
            year = candidate.year + (1 if candidate.month == 12 else 0)
            month = 1 if candidate.month == 12 else candidate.month + 1
            candidate = candidate.replace(year=year, month=month)
    return candidate


def should_run_scheduled_backup(db: Session, now: datetime | None = None) -> bool:
    """Checked roughly every 5 minutes by maintenance_service's background
    thread. Uses last_backup_date (of any type — see docs/decisions-log.md)
    to avoid running twice inside the same 2am hour, or a second time on a
    day a manual backup already happened."""
    schedule = get_backup_schedule(db)
    if schedule == "manual":
        return False
    if not get_backup_path(db):
        return False

    now = now or datetime.now(timezone.utc)
    if now.hour != 2:
        return False

    last_date, _size = get_last_backup_info(db)
    if last_date is not None and last_date.astimezone(timezone.utc).date() == now.date():
        return False

    if schedule == "daily":
        return True
    if schedule == "weekly":
        return now.weekday() == 6  # Sunday
    if schedule == "monthly":
        return now.day == 1
    return False


# --------------------------------------------------------------------------
# pg_dump / psql
# --------------------------------------------------------------------------


def _run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _dump_database(dest_path: str) -> None:
    result = _run(
        [
            "pg_dump",
            "--format=plain",
            "--no-owner",
            "--no-privileges",
            "--clean",
            "--if-exists",
            f"--file={dest_path}",
            f"--dbname={app_config.database_url}",
        ],
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Database dump failed: {result.stderr.strip()[-2000:]}")


def _restore_database(dump_path: str) -> None:
    result = _run(
        [
            "psql",
            "--single-transaction",
            "--variable=ON_ERROR_STOP=1",
            f"--dbname={app_config.database_url}",
            f"--file={dump_path}",
        ],
        timeout=900,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Database restore failed: {result.stderr.strip()[-4000:]}")


# --------------------------------------------------------------------------
# Manifest content
# --------------------------------------------------------------------------


def _record_counts(db: Session) -> dict:
    return {
        "users": db.query(func.count(User.id)).scalar(),
        "invoices": db.query(func.count(Invoice.id)).scalar(),
        "contributions": db.query(func.count(Contribution.id)).scalar(),
        "categories": db.query(func.count(Category.id)).scalar(),
        "planned_projects": db.query(func.count(PlannedProject.id)).scalar(),
        "monthly_reconciliations": db.query(func.count(MonthlyReconciliation.id)).scalar(),
        "reports": db.query(func.count(Report.id)).scalar(),
        "financial_years": db.query(func.count(FinancialYear.id)).scalar(),
        "settings": db.query(func.count(Setting.id)).scalar(),
        "audit_log": db.query(func.count(AuditLog.id)).scalar(),
        "audit_log_archive": db.query(func.count(AuditLogArchive.id)).scalar(),
        "error_log": db.query(func.count(ErrorLog.id)).scalar(),
    }


def _env_snapshot() -> dict:
    data = app_config.model_dump()
    return {k: v for k, v in data.items() if k not in _SECRET_CONFIG_FIELDS}


def _iter_storage_files(storage_root: str):
    for sub in ("invoices", "reports"):
        base = os.path.join(storage_root, sub)
        if not os.path.isdir(base):
            continue
        for root, _dirs, files in os.walk(base):
            for name in files:
                full = os.path.join(root, name)
                rel = os.path.relpath(full, storage_root).replace(os.sep, "/")
                yield full, rel


# --------------------------------------------------------------------------
# Create backup
# --------------------------------------------------------------------------


def backup_filename(backup_type: str, when: datetime) -> str:
    return f"keeptrack-backup-{backup_type}-{when.strftime('%Y%m%d-%H%M%S')}.zip"


def create_backup_zip(db: Session, backup_type: str, actor_username: str | None) -> tuple[str, dict]:
    """Builds a backup zip in a fresh temp file and returns (zip_path,
    manifest). The caller owns the temp file's lifetime — delete it once
    it's been streamed to the client and/or copied into backup_path."""
    storage_root = storage_service.get_storage_root(db)
    now = datetime.now(timezone.utc)

    fd, zip_path = tempfile.mkstemp(suffix=".zip", prefix="keeptrack-backup-")
    os.close(fd)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            dump_path = os.path.join(tmp, DUMP_FILENAME)
            _dump_database(dump_path)

            with open(dump_path, "rb") as f:
                checksum = hashlib.sha256(f.read()).hexdigest()

            files_included = [rel for _full, rel in _iter_storage_files(storage_root)]

            manifest = {
                "backup_format": BACKUP_FORMAT,
                "keep_track_version": APP_VERSION,
                "backup_type": backup_type,
                "created_at": now.isoformat(),
                "created_by": actor_username,
                "record_counts": _record_counts(db),
                "files_included": files_included,
                "env": _env_snapshot(),
                "secrets_to_copy_manually": sorted(_SECRET_CONFIG_FIELDS),
                "database_dump_filename": DUMP_FILENAME,
                "database_dump_checksum_sha256": checksum,
                "restore_instructions": (
                    "In Keep Track, go to Settings -> Storage & Backup -> Restore from backup, "
                    "upload this zip file, review the preview, and confirm with a Superadmin "
                    "password. The fields listed in 'secrets_to_copy_manually' are deliberately "
                    "not included in this backup (they are server credentials, not application "
                    "data) — copy their real values into the new system's .env file before or "
                    "immediately after restoring."
                ),
            }

            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(MANIFEST_FILENAME, json.dumps(manifest, indent=2, default=str))
                zf.write(dump_path, DUMP_FILENAME)
                for full, rel in _iter_storage_files(storage_root):
                    zf.write(full, f"files/{rel}")
    except Exception:
        if os.path.exists(zip_path):
            os.remove(zip_path)
        raise

    return zip_path, manifest


def perform_backup(
    db: Session, backup_type: str, actor_id: int | None, actor_username: str | None
) -> dict:
    zip_path, manifest = create_backup_zip(db, backup_type, actor_username)
    size_bytes = os.path.getsize(zip_path)
    now = datetime.now(timezone.utc)
    filename = backup_filename(backup_type, now)

    backup_path = get_backup_path(db)
    saved_path = None
    if backup_path:
        os.makedirs(backup_path, exist_ok=True)
        saved_path = os.path.join(backup_path, filename)
        shutil.copyfile(zip_path, saved_path)

    _set_setting(db, LAST_BACKUP_DATE_KEY, now.isoformat(), actor_id)
    _set_setting(db, LAST_BACKUP_SIZE_KEY, str(size_bytes), actor_id)
    db.commit()

    return {
        "zip_path": zip_path,
        "filename": filename,
        "size_bytes": size_bytes,
        "manifest": manifest,
        "saved_path": saved_path,
    }


# --------------------------------------------------------------------------
# List / delete backups on disk (backup_path)
# --------------------------------------------------------------------------


def list_backups(db: Session) -> list[dict]:
    backup_path = get_backup_path(db)
    if not backup_path or not os.path.isdir(backup_path):
        return []

    results = []
    for name in os.listdir(backup_path):
        match = _BACKUP_FILENAME_RE.match(name)
        if not match:
            continue
        backup_type, timestamp = match.groups()
        try:
            created_at = datetime.strptime(timestamp, "%Y%m%d-%H%M%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        full = os.path.join(backup_path, name)
        results.append(
            {
                "filename": name,
                "backup_type": backup_type,
                "created_at": created_at,
                "size_bytes": os.path.getsize(full),
            }
        )
    results.sort(key=lambda r: r["created_at"], reverse=True)
    return results


def apply_retention(db: Session) -> int:
    """Deletes the oldest scheduled backups beyond backup_retention_count.
    Manual backups are never auto-deleted, per the task brief's retention
    policy note."""
    backup_path = get_backup_path(db)
    if not backup_path:
        return 0
    retention = get_backup_retention_count(db)
    scheduled = sorted(
        (b for b in list_backups(db) if b["backup_type"] == "scheduled"),
        key=lambda r: r["created_at"],
        reverse=True,
    )
    to_delete = scheduled[retention:]
    for b in to_delete:
        try:
            os.remove(os.path.join(backup_path, b["filename"]))
        except OSError:
            pass
    return len(to_delete)


def backup_file_path(db: Session, filename: str) -> str:
    """Resolves a backup filename to its full path, guarding against path
    traversal via os.path.basename + the strict filename pattern."""
    backup_path = get_backup_path(db)
    if not backup_path:
        raise FileNotFoundError(filename)
    safe_name = os.path.basename(filename)
    if not _BACKUP_FILENAME_RE.match(safe_name):
        raise ValueError("Not a Keep Track backup filename")
    full = os.path.join(backup_path, safe_name)
    if not os.path.isfile(full):
        raise FileNotFoundError(filename)
    return full


def delete_backup_file(db: Session, filename: str) -> None:
    os.remove(backup_file_path(db, filename))


# --------------------------------------------------------------------------
# Restore
# --------------------------------------------------------------------------


def validate_backup_zip(zip_path: str) -> dict:
    """Parses backup_manifest.json and verifies the dump checksum, without
    restoring anything. Raises ValueError with a user-facing message on any
    problem. Used both for the restore preview and as the first step of the
    real restore (never trust a manifest that hasn't just been re-verified,
    even if a client already showed a preview of it)."""
    if not zipfile.is_zipfile(zip_path):
        raise ValueError("This file is not a valid zip archive")

    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        if MANIFEST_FILENAME not in names:
            raise ValueError("This zip file is not a Keep Track backup (missing backup_manifest.json)")
        try:
            manifest = json.loads(zf.read(MANIFEST_FILENAME))
        except json.JSONDecodeError as exc:
            raise ValueError("backup_manifest.json is corrupted or unreadable") from exc

        if manifest.get("backup_format") != BACKUP_FORMAT:
            raise ValueError("This zip file is not a recognised Keep Track backup")

        dump_filename = manifest.get("database_dump_filename", DUMP_FILENAME)
        if dump_filename not in names:
            raise ValueError("Backup is missing its database dump file")

        checksum = hashlib.sha256(zf.read(dump_filename)).hexdigest()
        if checksum != manifest.get("database_dump_checksum_sha256"):
            raise ValueError("Backup checksum verification failed — this file may be corrupted")

    return manifest


# The two subdirectories directly under storage_root that a fresh restore
# fully replaces — mirrors storage_service.move_storage_root's own list.
_STAGING_SUBDIRS = ("invoices", "reports")


def _stage_existing_storage_aside(storage_root: str) -> dict | None:
    """Moves every entry currently under storage_root/invoices and
    storage_root/reports into a sibling staging directory, one entry at a
    time — never storage_root/invoices or storage_root/reports themselves,
    which are Docker volume mount points in the default deployment and
    can't be renamed or rmtree'd as a whole (attempting to fails with
    "Device or resource busy" only *after* silently deleting everything
    inside them, since shutil.rmtree removes a directory's contents before
    the final, failing, rmdir of the directory itself). Confirmed directly
    against a running stack: an earlier version of this function moved
    storage_root as a single unit and wiped every invoice/report file on
    the very first restore attempt. Same problem, same fix, as
    storage_service.move_storage_root — see its docstring and
    docs/decisions-log.md.

    Returns None if there was nothing to stage."""
    staged_dirs: dict[str, str] = {}
    staged_entries: dict[str, list[str]] = {}
    for sub in _STAGING_SUBDIRS:
        src = os.path.join(storage_root, sub)
        if not os.path.isdir(src) or not os.listdir(src):
            continue
        staging_dir = f"{src.rstrip('/')}.pre-restore-{uuid.uuid4().hex[:8]}"
        os.makedirs(staging_dir, exist_ok=True)
        entries = []
        for entry in os.listdir(src):
            shutil.move(os.path.join(src, entry), os.path.join(staging_dir, entry))
            entries.append(entry)
        staged_dirs[sub] = staging_dir
        staged_entries[sub] = entries

    if not staged_dirs:
        return None
    return {"dirs": staged_dirs, "entries": staged_entries}


def _restore_staged_aside(storage_root: str, staged: dict | None) -> None:
    if staged is None:
        return
    for sub, staging_dir in staged["dirs"].items():
        src = os.path.join(storage_root, sub)
        for entry in staged["entries"][sub]:
            target = os.path.join(src, entry)
            if os.path.isdir(target):
                shutil.rmtree(target, ignore_errors=True)
            elif os.path.exists(target):
                os.remove(target)
            shutil.move(os.path.join(staging_dir, entry), target)
        shutil.rmtree(staging_dir, ignore_errors=True)


def _discard_staged_aside(staged: dict | None) -> None:
    if staged is None:
        return
    for staging_dir in staged["dirs"].values():
        shutil.rmtree(staging_dir, ignore_errors=True)


def restore_from_zip(zip_path: str) -> dict:
    """Restores the database, then the storage files, checks Superadmin
    consistency, and invalidates every existing login session. The caller
    (routers/storage.py) is responsible for entering/exiting maintenance
    mode around this call and for deleting `zip_path` afterwards.

    Order (per the task brief): verify checksums (upfront, via
    validate_backup_zip — failing fast before touching anything is safer
    than only discovering corruption after the database has already been
    replaced) -> restore database -> restore files -> Superadmin
    consistency check -> invalidate sessions. Database restore uses
    `psql --single-transaction`, so a failure there leaves the database
    exactly as it was; a failure restoring files rolls the storage
    directory back to what it held before this call started.
    """
    manifest = validate_backup_zip(zip_path)

    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(zip_path) as zf:
        dump_filename = manifest.get("database_dump_filename", DUMP_FILENAME)
        zf.extract(dump_filename, tmp)
        dump_path = os.path.join(tmp, dump_filename)

        _restore_database(dump_path)
        # Drop pooled connections opened against the pre-restore database —
        # the schema is unchanged but every row underneath them just was.
        engine.dispose()

        db = SessionLocal()
        try:
            storage_root = storage_service.get_storage_root(db)

            staged = _stage_existing_storage_aside(storage_root)
            try:
                for name in zf.namelist():
                    if not name.startswith("files/") or name == "files/":
                        continue
                    rel = name[len("files/"):]
                    dest = os.path.join(storage_root, rel)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with zf.open(name) as src, open(dest, "wb") as out:
                        shutil.copyfileobj(src, out)
            except Exception:
                _restore_staged_aside(storage_root, staged)
                raise
            else:
                _discard_staged_aside(staged)

            superadmin_warning = None
            superadmin_row = db.query(User).filter(User.role == "superadmin").first()
            if (
                superadmin_row is not None
                and app_config.superadmin_username
                and superadmin_row.username != app_config.superadmin_username
            ):
                superadmin_warning = (
                    "The restored database has a different Superadmin account than this "
                    "installation. You may need to update your .env file."
                )

            now = datetime.now(timezone.utc)
            _set_setting(db, JWT_INVALIDATE_BEFORE_KEY, now.isoformat())
            db.commit()

            audit_service.log_action(
                db,
                "system.restored",
                f"System restored from a backup created {manifest.get('created_at')}",
                metadata={"record_counts": manifest.get("record_counts")},
            )

            return {
                "record_counts": manifest.get("record_counts"),
                "backup_created_at": manifest.get("created_at"),
                "superadmin_warning": superadmin_warning,
            }
        finally:
            db.close()
