"""Folder Integration endpoints: status/monitoring, connection tests,
configuration, the paginated watcher log, and the duplicate-override action.

Configuration lives in the `settings` table (see
services/folder_service.py's key constants) via GET/PUT /folder/config —
the same "bespoke endpoint so a secret field can be encrypted server-side"
pattern as routers/ai_settings.py's GET/PUT /ai/config, since the generic
PUT /settings/{key} (routers/settings.py) would otherwise write an SMB
password as plaintext.

All configuration/monitoring endpoints are Admin only. Duplicate override is
Standard and Admin, matching every other invoice-review action. See
docs/decisions-log.md.
"""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.audit_log import AuditLog
from models.folder_watcher_log import FolderWatcherLog
from models.planned_project import PlannedProject
from models.schemas import (
    FolderConfigOut,
    FolderInputConfigUpdate,
    FolderInputStatusOut,
    FolderOutputConfigUpdate,
    FolderOutputStatusOut,
    FolderOverrideDuplicateRequest,
    FolderSideConfigOut,
    FolderStatusOut,
    FolderTestResultOut,
    FolderWatcherLogOut,
    InvoiceOut,
    PaginatedResponse,
)
from models.setting import Setting
from models.user import User
from services import audit_service, folder_service, folder_watcher_service
from utils.crypto import encrypt_secret
from utils.deps import require_admin, require_module, require_standard
from utils.pagination import paginate

router = APIRouter(prefix="/folder", tags=["folder"], dependencies=[Depends(require_module("folder_integration"))])


# Not reused from routers/invoices.py — this project prefers explicit
# duplication over a cross-router import for a single small helper (see
# routers/imports.py's own copy of the same helper).
def _invoice_to_out(db: Session, invoice) -> dict:
    project_name = None
    if invoice.project_id is not None:
        project = db.get(PlannedProject, invoice.project_id)
        project_name = project.name if project else None

    return {
        "id": invoice.id,
        "filename": invoice.filename,
        "upload_date": invoice.upload_date,
        "invoice_date": invoice.invoice_date,
        "supplier": invoice.supplier,
        "amount": invoice.amount,
        "category_id": invoice.category_id,
        "notes": invoice.notes,
        "signed": invoice.signed,
        "signed_pdf_path": invoice.signed_pdf_path,
        "financial_year_id": invoice.financial_year_id,
        "reviewed": invoice.reviewed,
        "duplicate_flag": invoice.duplicate_flag,
        "created_by": invoice.created_by,
        "created_at": invoice.created_at,
        "project_id": invoice.project_id,
        "project_name": project_name,
        "is_historical": invoice.is_historical,
        "import_batch_id": invoice.import_batch_id,
        "import_source": invoice.import_source,
    }


def _side_config_out(cfg: dict) -> FolderSideConfigOut:
    return FolderSideConfigOut(
        enabled=cfg["enabled"],
        type=cfg["type"],
        path=cfg["path"],
        smb_server=cfg["smb_server"],
        smb_share=cfg["smb_share"],
        smb_username=cfg["smb_username"],
        smb_password_set=bool(cfg["smb_password_encrypted"]),
        smb_guest=cfg["smb_guest"],
    )


def _config_out(db: Session) -> FolderConfigOut:
    input_cfg = folder_service.get_input_config(db)
    output_cfg = folder_service.get_output_config(db)
    return FolderConfigOut(
        input=_side_config_out(input_cfg),
        output=_side_config_out(output_cfg),
        poll_interval=input_cfg["poll_interval"],
        output_behaviour=output_cfg["behaviour"],
    )


def _set_setting(db: Session, key: str, value: str | None, admin: User) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        row = Setting(key=key)
        db.add(row)
    row.value = value
    row.updated_by = admin.id


@router.get("/status", response_model=FolderStatusOut)
def get_folder_status(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    input_cfg = folder_service.get_input_config(db)
    output_cfg = folder_service.get_output_config(db)

    today_start = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc)

    last_poll = folder_watcher_service.get_last_poll(db)
    next_poll = None
    if last_poll is not None and input_cfg["enabled"]:
        from datetime import timedelta

        next_poll = last_poll + timedelta(seconds=input_cfg["poll_interval"])

    files_processed_today = (
        db.query(FolderWatcherLog)
        .filter(FolderWatcherLog.status.in_(("completed", "duplicate_overridden")))
        .filter(FolderWatcherLog.created_at >= today_start)
        .count()
    )
    files_written_today = (
        db.query(AuditLog)
        .filter(AuditLog.action_type == "folder.output_written")
        .filter(AuditLog.created_at >= today_start)
        .count()
    )

    recent_log = (
        db.query(FolderWatcherLog)
        .order_by(FolderWatcherLog.created_at.desc())
        .limit(20)
        .all()
    )

    return FolderStatusOut(
        input=FolderInputStatusOut(
            enabled=input_cfg["enabled"],
            type=input_cfg["type"],
            configured=folder_service.is_configured(input_cfg),
            last_poll=last_poll,
            next_poll=next_poll,
            files_processed_today=files_processed_today,
        ),
        output=FolderOutputStatusOut(
            enabled=output_cfg["enabled"],
            type=output_cfg["type"],
            configured=folder_service.is_configured(output_cfg),
            files_written_today=files_written_today,
        ),
        recent_log=recent_log,
    )


@router.get("/log", response_model=PaginatedResponse[FolderWatcherLogOut])
def get_folder_log(
    log_status: str | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = db.query(FolderWatcherLog)
    if log_status:
        query = query.filter(FolderWatcherLog.status == log_status)
    query = query.order_by(FolderWatcherLog.created_at.desc())
    items, pagination = paginate(query, page, per_page)
    return {"data": items, "pagination": pagination}


@router.get("/config", response_model=FolderConfigOut)
def get_folder_config(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return _config_out(db)


@router.put("/input-config", response_model=FolderConfigOut)
def update_input_config(
    payload: FolderInputConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.poll_interval not in folder_service.POLL_INTERVAL_CHOICES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Poll interval must be one of: {', '.join(str(s) for s in folder_service.POLL_INTERVAL_CHOICES)} seconds",
        )
    if payload.enabled and payload.type == "local" and not (payload.path or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A local path is required to enable the input folder")
    if payload.enabled and payload.type == "smb" and not ((payload.smb_server or "").strip() and (payload.smb_share or "").strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "SMB server and share are required to enable the input folder")

    _set_setting(db, folder_service.INPUT_ENABLED_KEY, "true" if payload.enabled else "false", admin)
    _set_setting(db, folder_service.INPUT_TYPE_KEY, payload.type, admin)
    _set_setting(db, folder_service.INPUT_PATH_KEY, (payload.path or "").strip() or None, admin)
    _set_setting(db, folder_service.INPUT_SMB_SERVER_KEY, (payload.smb_server or "").strip() or None, admin)
    _set_setting(db, folder_service.INPUT_SMB_SHARE_KEY, (payload.smb_share or "").strip() or None, admin)
    _set_setting(db, folder_service.INPUT_SMB_USERNAME_KEY, (payload.smb_username or "").strip() or None, admin)
    if payload.smb_password is not None:
        _set_setting(
            db, folder_service.INPUT_SMB_PASSWORD_KEY,
            encrypt_secret(payload.smb_password) if payload.smb_password else None,
            admin,
        )
    _set_setting(db, folder_service.INPUT_SMB_GUEST_KEY, "true" if payload.smb_guest else "false", admin)
    _set_setting(db, folder_service.INPUT_POLL_INTERVAL_KEY, str(payload.poll_interval), admin)
    db.commit()

    audit_service.log_action(
        db, "settings.changed", "Folder Integration input folder configuration updated",
        user_id=admin.id, affected_table="settings",
    )
    return _config_out(db)


@router.put("/output-config", response_model=FolderConfigOut)
def update_output_config(
    payload: FolderOutputConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.enabled and payload.type == "local" and not (payload.path or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A local path is required to enable the output folder")
    if payload.enabled and payload.type == "smb" and not ((payload.smb_server or "").strip() and (payload.smb_share or "").strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "SMB server and share are required to enable the output folder")

    _set_setting(db, folder_service.OUTPUT_ENABLED_KEY, "true" if payload.enabled else "false", admin)
    _set_setting(db, folder_service.OUTPUT_TYPE_KEY, payload.type, admin)
    _set_setting(db, folder_service.OUTPUT_PATH_KEY, (payload.path or "").strip() or None, admin)
    _set_setting(db, folder_service.OUTPUT_SMB_SERVER_KEY, (payload.smb_server or "").strip() or None, admin)
    _set_setting(db, folder_service.OUTPUT_SMB_SHARE_KEY, (payload.smb_share or "").strip() or None, admin)
    _set_setting(db, folder_service.OUTPUT_SMB_USERNAME_KEY, (payload.smb_username or "").strip() or None, admin)
    if payload.smb_password is not None:
        _set_setting(
            db, folder_service.OUTPUT_SMB_PASSWORD_KEY,
            encrypt_secret(payload.smb_password) if payload.smb_password else None,
            admin,
        )
    _set_setting(db, folder_service.OUTPUT_SMB_GUEST_KEY, "true" if payload.smb_guest else "false", admin)
    _set_setting(db, folder_service.OUTPUT_BEHAVIOUR_KEY, payload.behaviour, admin)
    db.commit()

    audit_service.log_action(
        db, "settings.changed", "Folder Integration output folder configuration updated",
        user_id=admin.id, affected_table="settings",
    )
    return _config_out(db)


@router.post("/test-input", response_model=FolderTestResultOut)
def test_input_connection(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    config = folder_service.get_input_config(db)
    if not folder_service.is_configured(config):
        return FolderTestResultOut(success=False, error="Input folder is not configured yet")

    try:
        service = folder_service.build_service(config)
    except folder_service.FolderConnectionError as exc:
        return FolderTestResultOut(success=False, error=str(exc))

    try:
        files = service.list_files(".pdf")
        return FolderTestResultOut(success=True, file_count=len(files))
    except Exception as exc:
        return FolderTestResultOut(success=False, error=str(exc))
    finally:
        service.disconnect()


@router.post("/test-output", response_model=FolderTestResultOut)
def test_output_connection(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    config = folder_service.get_output_config(db)
    if not folder_service.is_configured(config):
        return FolderTestResultOut(success=False, error="Output folder is not configured yet")

    try:
        service = folder_service.build_service(config)
    except folder_service.FolderConnectionError as exc:
        return FolderTestResultOut(success=False, error=str(exc))

    test_filename = f".keep_track_connection_test_{uuid.uuid4().hex}.txt"
    try:
        service.write_file(test_filename, b"Keep Track connection test")
        service.delete_file(test_filename)
        return FolderTestResultOut(success=True)
    except Exception as exc:
        return FolderTestResultOut(success=False, error=str(exc))
    finally:
        service.disconnect()


@router.post("/override-duplicate", response_model=InvoiceOut)
def override_duplicate(
    payload: FolderOverrideDuplicateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    try:
        invoice = folder_watcher_service.override_duplicate(db, payload.filename, user)
    except folder_service.FolderConnectionError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _invoice_to_out(db, invoice)
