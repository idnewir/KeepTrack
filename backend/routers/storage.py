"""File storage configuration and full backup/restore endpoints.

GET /storage/status, PUT /storage/path, GET/POST /storage/backup,
POST /storage/backup/schedule, and POST /storage/restore are exactly as
scoped in the task brief. GET/DELETE /storage/backup/{filename} and
POST /storage/restore/preview were added beyond that list — the frontend's
Backup History needs per-file download/delete actions, and restore's
"shows a preview before restoring" requirement has nothing to call without
an endpoint that parses a backup's manifest without restoring it. Both
follow the precedent already set for endpoints added this way elsewhere in
the app (e.g. GET /auth/setup-status, POST /logs/audit/archive) — see
docs/decisions-log.md.
"""
import os
import shutil
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from config import settings as app_config
from database import SessionLocal, get_db
from models.schemas import (
    BackupManifestPreview,
    BackupOut,
    BackupScheduleOut,
    BackupScheduleRequest,
    RestoreResultOut,
    StoragePathChangeRequest,
    StoragePathChangeResponse,
    StorageStatusOut,
)
from models.setting import Setting
from models.user import User
from services import audit_service, backup_service, error_service, storage_service
from utils.deps import require_admin, require_superadmin
from utils.security import verify_password

router = APIRouter(prefix="/storage", tags=["storage"])


def _breakdown(db: Session) -> list[dict]:
    items = []
    for label, path in (
        ("Original PDFs", storage_service.invoices_original_root(db)),
        ("Signed PDFs", storage_service.invoices_signed_root(db)),
        ("Generated reports", storage_service.reports_root(db)),
    ):
        count, size = storage_service.dir_stats(path)
        items.append(
            {
                "label": label,
                "file_count": count,
                "size_bytes": size,
                "size_human": storage_service.human_readable_size(size),
            }
        )
    return items


@router.get("/status", response_model=StorageStatusOut)
def storage_status(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    breakdown = _breakdown(db)
    total_files = sum(b["file_count"] for b in breakdown)
    total_size = sum(b["size_bytes"] for b in breakdown)
    last_date, last_size = backup_service.get_last_backup_info(db)

    return StorageStatusOut(
        storage_path=storage_service.get_storage_root(db),
        total_files=total_files,
        total_size_bytes=total_size,
        total_size_human=storage_service.human_readable_size(total_size),
        breakdown=breakdown,
        backup_path=backup_service.get_backup_path(db),
        backup_schedule=backup_service.get_backup_schedule(db),
        backup_retention_count=backup_service.get_backup_retention_count(db),
        last_backup_date=last_date,
        last_backup_size_human=(
            storage_service.human_readable_size(last_size) if last_size is not None else None
        ),
        next_scheduled_backup=backup_service.next_scheduled_run(db),
    )


@router.put("/path", response_model=StoragePathChangeResponse)
def change_storage_path(
    payload: StoragePathChangeRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        storage_service.check_path_writable(payload.new_path)
    except OSError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"New path is not writable: {exc}") from exc

    setting = db.query(Setting).filter(Setting.key == storage_service.STORAGE_PATH_KEY).first()
    before = setting.value if setting is not None else storage_service.DEFAULT_STORAGE_PATH

    if payload.move_files:
        try:
            move_result = storage_service.move_storage_root(db, payload.new_path)
        except Exception as exc:
            error_service.log_error(
                db, "error", "storage_move", f"Storage path move failed: {exc}", user_id=admin.id,
            )
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to move files — storage path unchanged: {exc}"
            ) from exc
    else:
        move_result = {"files_moved": 0, "bytes_moved": 0}

    if setting is None:
        setting = Setting(key=storage_service.STORAGE_PATH_KEY)
        db.add(setting)
    setting.value = payload.new_path
    setting.updated_by = admin.id
    db.commit()
    db.refresh(setting)

    audit_service.log_action(
        db, "storage.path_changed",
        f"Storage path changed from '{before}' to '{payload.new_path}' "
        f"(move_files={payload.move_files}, {move_result['files_moved']} files moved)",
        user_id=admin.id, affected_table="settings", affected_record_id=setting.id,
        metadata={"before": before, "after": payload.new_path, **move_result},
    )

    message = (
        f"Storage path updated. {move_result['files_moved']} file(s) "
        f"({storage_service.human_readable_size(move_result['bytes_moved'])}) moved."
        if payload.move_files
        else "Storage path updated. Existing file links were not moved and will break."
    )

    return StoragePathChangeResponse(
        storage_path=payload.new_path,
        files_moved=move_result["files_moved"],
        bytes_moved=move_result["bytes_moved"],
        message=message,
    )


@router.get("/backup", response_model=list[BackupOut])
def list_backups(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    return [
        {
            "filename": b["filename"],
            "backup_type": b["backup_type"],
            "created_at": b["created_at"],
            "size_bytes": b["size_bytes"],
            "size_human": storage_service.human_readable_size(b["size_bytes"]),
        }
        for b in backup_service.list_backups(db)
    ]


@router.post("/backup")
def create_backup(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        result = backup_service.perform_backup(db, "manual", admin.id, admin.username)
    except RuntimeError as exc:
        error_service.log_error(db, "critical", "backup", f"Manual backup failed: {exc}", user_id=admin.id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Backup failed: {exc}") from exc

    audit_service.log_action(
        db, "backup.created",
        f"Manual backup created ('{result['filename']}', "
        f"{storage_service.human_readable_size(result['size_bytes'])})",
        user_id=admin.id,
        metadata={
            "filename": result["filename"],
            "size_bytes": result["size_bytes"],
            "saved_to_backup_path": result["saved_path"] is not None,
        },
    )

    zip_path = result["zip_path"]
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=result["filename"],
        background=BackgroundTask(lambda: os.path.exists(zip_path) and os.remove(zip_path)),
    )


@router.get("/backup/{filename}/download")
def download_backup(filename: str, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    try:
        full_path = backup_service.backup_file_path(db, filename)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found") from exc
    return FileResponse(full_path, media_type="application/zip", filename=filename)


@router.delete("/backup/{filename}")
def delete_backup(filename: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        backup_service.delete_backup_file(db, filename)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found") from exc

    audit_service.log_action(db, "backup.deleted", f"Deleted backup '{filename}'", user_id=admin.id)
    return {"message": f"Deleted backup '{filename}'"}


@router.post("/backup/schedule", response_model=BackupScheduleOut)
def set_backup_schedule(
    payload: BackupScheduleRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        backup_service.set_backup_schedule(
            db, payload.backup_schedule, payload.backup_path, payload.backup_retention_count, admin.id,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    audit_service.log_action(
        db, "backup.schedule_changed",
        f"Backup schedule set to '{payload.backup_schedule}'"
        + (f" (destination: {payload.backup_path})" if payload.backup_path else ""),
        user_id=admin.id,
        metadata={
            "schedule": payload.backup_schedule,
            "backup_path": payload.backup_path,
            "retention_count": payload.backup_retention_count,
        },
    )

    return BackupScheduleOut(
        backup_schedule=backup_service.get_backup_schedule(db),
        backup_path=backup_service.get_backup_path(db),
        backup_retention_count=backup_service.get_backup_retention_count(db),
        next_scheduled_backup=backup_service.next_scheduled_run(db),
    )


@router.post("/restore/preview", response_model=BackupManifestPreview)
def preview_restore(
    file: UploadFile = File(...),
    _superadmin: User = Depends(require_superadmin),
):
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            shutil.copyfileobj(file.file, f)
        try:
            manifest = backup_service.validate_backup_zip(tmp_path)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    finally:
        os.remove(tmp_path)

    # The manifest's env snapshot is the source system's own config at
    # backup time, which ensure_superadmin() keeps in sync with that
    # system's actual Superadmin row — a reliable stand-in for "what
    # Superadmin username is inside this backup's database dump" without
    # having to parse the SQL dump just to show a preview.
    superadmin_warning = None
    restored_superadmin_username = (manifest.get("env") or {}).get("superadmin_username")
    if (
        restored_superadmin_username
        and app_config.superadmin_username
        and restored_superadmin_username != app_config.superadmin_username
    ):
        superadmin_warning = (
            "The restored database has a different Superadmin account than this "
            "installation. You may need to update your .env file."
        )

    return BackupManifestPreview(
        backup_type=manifest.get("backup_type", "unknown"),
        created_at=manifest.get("created_at"),
        keep_track_version=manifest.get("keep_track_version", "unknown"),
        record_counts=manifest.get("record_counts", {}),
        files_included_count=len(manifest.get("files_included", [])),
        secrets_to_copy_manually=manifest.get("secrets_to_copy_manually", []),
        superadmin_warning=superadmin_warning,
    )


@router.post("/restore", response_model=RestoreResultOut)
def restore_backup(
    file: UploadFile = File(...),
    superadmin_password: str = Form(...),
    db: Session = Depends(get_db),
    superadmin: User = Depends(require_superadmin),
):
    if not verify_password(superadmin_password, superadmin.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect Superadmin password.")

    superadmin_id = superadmin.id
    # require_superadmin's own get_current_user dependency already loaded
    # superadmin via this same request-scoped session (FastAPI caches
    # Depends(get_db) per request) and never closes it until this function
    # returns — left open, it sits "idle in transaction" for the entire
    # restore below and blocks psql's DROP TABLE on a lock. Confirmed
    # directly against a running stack: the very first restore attempt hung
    # for over two minutes on exactly this until the connection was killed
    # by hand. Closing it explicitly here is what unblocks the dump/restore
    # subprocess. See docs/decisions-log.md.
    db.close()

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            shutil.copyfileobj(file.file, f)

        backup_service.enter_maintenance_mode()
        try:
            result = backup_service.restore_from_zip(tmp_path)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        except RuntimeError as exc:
            fresh_db = SessionLocal()
            try:
                error_service.log_error(
                    fresh_db, "critical", "backup_restore", f"Restore failed: {exc}", user_id=superadmin_id,
                )
            finally:
                fresh_db.close()
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Restore failed: {exc}") from exc
        finally:
            backup_service.exit_maintenance_mode()
    finally:
        os.remove(tmp_path)

    return RestoreResultOut(
        message="Restore completed. Everyone, including you, must log in again.",
        record_counts=result["record_counts"] or {},
        backup_created_at=result["backup_created_at"],
        superadmin_warning=result["superadmin_warning"],
    )
