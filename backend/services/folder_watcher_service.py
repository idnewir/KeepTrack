"""Folder Integration: the input-folder watcher and the output-folder writer.

INPUT — a background daemon thread (started once from main.py's startup
hook, same `threading.Thread(daemon=True)` + sleep-loop pattern as
services/maintenance_service.py's retention scheduler — see
docs/decisions-log.md for why this app doesn't reach for APScheduler here)
polls the configured input folder on `folder_input_poll_interval`, re-read
at the top of every iteration so a change in Settings takes effect from the
very next poll without a restart. Each PDF found in the folder's root is
either flagged as a duplicate (by filename, against folder_watcher_log's
history of completed imports) or run through the same
extract -> create invoice -> file pipeline as a manual upload, then moved
into a processed/ subfolder.

OUTPUT — write_to_output_folder() is called directly (not polled) from
POST /invoices/{id}/sign and from the invoice detail page's manual
"Export to output folder" button, writing a signed PDF to
/FY{year}-{year+1}/{Month}/{supplier}_{date}_{filename}.pdf.

Background logic here always runs regardless of the folder_integration
feature module's enabled state — only the API surface (routers/folder.py)
is gated. See docs/decisions-log.md and docs/architecture.md's Feature
Modules section.
"""
import logging
import os
import re
import threading
import time
import traceback
from datetime import date, datetime, timezone
from urllib.parse import quote

from sqlalchemy.orm import Session

from database import SessionLocal
from models.category import Category
from models.folder_watcher_log import FolderWatcherLog
from models.invoice import Invoice
from models.invoice_file import InvoiceFile
from models.setting import Setting
from models.user import User
from services import audit_service, error_service, folder_service, notification_service, storage_service
from services.ai_provider_service import extract_invoice_data
from services.ai_service import check_duplicate
from services.date_service import get_app_start_date
from services.financial_year_service import MONTH_LABELS_FULL, fy_bounds_for, get_or_create_financial_year
from services.reconciliation_service import mark_reconciliation_stale

logger = logging.getLogger("keep_track.folder_watcher")

DEFAULT_POLL_INTERVAL_SECONDS = 60
LAST_POLL_KEY = "folder_input_last_poll"

_SUPPLIER_SLUG_RE = re.compile(r"[^A-Za-z0-9]+")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _system_actor_id(db: Session) -> int | None:
    """Attributes watcher-created invoices to the oldest Admin account —
    Invoice.created_by is a NOT NULL FK with no "system" sentinel, and every
    functioning install has at least one Admin (created by the setup
    wizard) before real data can exist. Falls back to Superadmin (which may
    not exist, since it's env-var-bootstrapped and optional) only if
    somehow no Admin exists yet. See docs/decisions-log.md."""
    admin = db.query(User).filter(User.role == "admin").order_by(User.id).first()
    if admin is not None:
        return admin.id
    superadmin = db.query(User).filter(User.role == "superadmin").order_by(User.id).first()
    return superadmin.id if superadmin else None


def _record_poll_time(db: Session) -> None:
    setting = db.query(Setting).filter(Setting.key == LAST_POLL_KEY).first()
    if setting is None:
        setting = Setting(key=LAST_POLL_KEY)
        db.add(setting)
    setting.value = datetime.now(timezone.utc).isoformat()
    db.commit()


def get_last_poll(db: Session) -> datetime | None:
    setting = db.query(Setting).filter(Setting.key == LAST_POLL_KEY).first()
    if setting is None or not setting.value:
        return None
    return datetime.fromisoformat(setting.value)


# ---------------------------------------------------------------------------
# Input watcher
# ---------------------------------------------------------------------------

def _is_duplicate(db: Session, filename: str) -> FolderWatcherLog | None:
    """The most recent *completed* import of this exact filename, or None.
    Duplicate detection is filename-based (not content-hash-based) — see
    docs/decisions-log.md for why."""
    return (
        db.query(FolderWatcherLog)
        .filter(FolderWatcherLog.filename == filename, FolderWatcherLog.status == "completed")
        .order_by(FolderWatcherLog.created_at.desc())
        .first()
    )


def _duplicate_notification_link(existing_invoice_id: int | None, filename: str) -> str:
    """Both notification actions (View existing invoice / Process anyway)
    share this one `link` field on the Notification row — there is no
    per-notification "actions" concept in this app's notification model, so
    the destination invoice id and the original filename are both encoded
    into the URL the frontend already renders as a plain link. The
    NotificationBell component special-cases type='folder_duplicate_detected'
    to render two buttons from this one URL instead of navigating on click.
    See docs/decisions-log.md."""
    base = f"/invoices/{existing_invoice_id}" if existing_invoice_id else "/invoices"
    return f"{base}?duplicate_filename={quote(filename)}"


def _handle_duplicate(db: Session, filename: str) -> None:
    existing = _is_duplicate(db, filename)
    existing_invoice_id = existing.invoice_id if existing else None

    log_entry = FolderWatcherLog(
        event_type="input_poll",
        filename=filename,
        status="duplicate_flagged",
        invoice_id=existing_invoice_id,
        message="A file with this name has already been processed",
    )
    db.add(log_entry)
    db.commit()

    notification_service.notify_admins(
        db,
        type="folder_duplicate_detected",
        title="Duplicate file detected",
        message=f"File {filename} has already been processed. View the existing invoice or process it anyway.",
        link=_duplicate_notification_link(existing_invoice_id, filename),
        severity="warning",
    )
    audit_service.log_action(
        db, "folder.duplicate_detected", f"Duplicate file detected in watched folder: '{filename}'",
        affected_table="invoices", affected_record_id=existing_invoice_id,
    )


def _notify_new_invoice(db: Session, invoice: Invoice, filename: str) -> None:
    """Admins and Standard users (both have upload permission — Read Only
    does not) rather than notify_admins alone. See docs/decisions-log.md."""
    supplier = invoice.supplier or "Unknown supplier"
    message = f"Invoice from {supplier} ({filename}) has been added to your review queue."
    recipient_ids = [
        row.id for row in db.query(User.id).filter(User.role.in_(("admin", "superadmin", "standard"))).all()
    ]
    for user_id in recipient_ids:
        notification_service.create_notification(
            db, user_id, type="folder_new_invoice",
            title="New invoice detected",
            message=message,
            link="/invoices?filter=unreviewed",
            severity="info",
        )


def _process_new_file(
    db: Session, service: "folder_service.FolderService", filename: str, terminal_status: str = "completed",
) -> tuple[Invoice | None, str | None]:
    """Reads, extracts, creates the invoice record, moves the original into
    processed/, and logs the outcome. Never raises — returns
    (invoice, None) on success or (None, error_message) on failure, so both
    the poll loop (which just logs the outcome) and the duplicate-override
    endpoint (which needs to report success/failure to the caller) can use
    it the same way."""
    log_entry = FolderWatcherLog(event_type="input_poll", filename=filename, status="detected")
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    log_entry_id = log_entry.id

    try:
        content = service.read_file(filename)
        stored_path = storage_service.save_invoice_pdf(db, filename, content)

        categories = db.query(Category).filter(Category.active.is_(True)).order_by(Category.name).all()
        category_ids = {c.id for c in categories}
        # extract_invoice_data applies transaction rules itself (rules
        # override the AI's own category guess) — see
        # services/ai_provider_service.py's _apply_rule_override and
        # docs/decisions-log.md — so watched-folder invoices get the same
        # rule-based categorisation as a manual upload with no extra call
        # needed here.
        extracted = extract_invoice_data(content, categories, db)
        category_id = extracted["category_id"] if extracted["category_id"] in category_ids else None
        duplicate_flag = check_duplicate(db, extracted["supplier"], extracted["amount"], extracted["invoice_date"])

        invoice_date = extracted["invoice_date"] or date.today()
        app_start_date = get_app_start_date(db)
        is_historical = app_start_date is not None and invoice_date < app_start_date

        actor_id = _system_actor_id(db)
        if actor_id is None:
            raise RuntimeError("No Admin account exists yet to attribute this invoice to")

        invoice = Invoice(
            filename=filename,
            invoice_date=invoice_date,
            supplier=extracted["supplier"] or "",
            amount=extracted["amount"] or 0,
            category_id=category_id,
            notes=extracted["notes"],
            duplicate_flag=duplicate_flag,
            reviewed=is_historical,
            is_historical=is_historical,
            import_source="watched_folder",
            created_by=actor_id,
        )
        db.add(invoice)
        db.flush()
        db.add(InvoiceFile(invoice_id=invoice.id, original_path=stored_path))
        db.commit()
        db.refresh(invoice)

        if is_historical:
            fy = get_or_create_financial_year(db, invoice_date)
            mark_reconciliation_stale(db, invoice_date, fy.id, "Historical invoice auto-imported from watched folder")

        service.move_file(filename)

        entry = db.get(FolderWatcherLog, log_entry_id)
        entry.status = terminal_status
        entry.invoice_id = invoice.id
        db.commit()

        audit_service.log_action(
            db, "folder.invoice_imported", f"Auto-imported invoice '{filename}' from watched input folder",
            affected_table="invoices", affected_record_id=invoice.id,
        )

        if not is_historical:
            _notify_new_invoice(db, invoice, filename)

        return invoice, None

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to process watched-folder file '%s'", filename)
        error_message = str(exc)[:1000]

        entry = db.get(FolderWatcherLog, log_entry_id)
        if entry is not None:
            entry.status = "failed"
            entry.message = error_message
            db.commit()

        error_service.log_error(
            db, "error", "folder_watcher", f"Failed to process watched-folder file '{filename}': {exc}",
            stack_trace=traceback.format_exc(),
        )
        notification_service.notify_admins(
            db, type="folder_import_failed",
            title="Failed to process invoice from watched folder",
            message=f"Failed to process {filename} — {error_message[:200]}",
            link="/settings?section=folder",
            severity="error",
        )
        return None, error_message


def poll_input_folder(db: Session) -> None:
    config = folder_service.get_input_config(db)
    if not config["enabled"]:
        return
    if not folder_service.is_configured(config):
        return

    _record_poll_time(db)

    try:
        service = folder_service.build_service(config)
    except folder_service.FolderConnectionError as exc:
        logger.warning("Input folder connection failed: %s", exc)
        error_service.log_error(db, "warning", "folder_watcher", f"Input folder connection failed: {exc}")
        return

    try:
        filenames = service.list_files(".pdf")
        for filename in filenames:
            if _is_duplicate(db, filename) is not None:
                _handle_duplicate(db, filename)
            else:
                _process_new_file(db, service, filename)
    except Exception:
        logger.exception("Unexpected error while polling input folder")
        error_service.log_error(
            db, "error", "folder_watcher", "Unexpected error while polling input folder",
            stack_trace=traceback.format_exc(),
        )
    finally:
        service.disconnect()


def override_duplicate(db: Session, filename: str, user: User) -> Invoice:
    """POST /folder/override-duplicate — reprocesses `filename` ignoring its
    duplicate flag. The file must still be sitting in the input folder's
    root (a duplicate-flagged file is never moved to processed/), so this
    reconnects fresh and runs it through the same pipeline as a normal poll,
    recording the outcome as 'duplicate_overridden' rather than 'completed'.
    Raises ValueError on a problem the router should return as a 400."""
    config = folder_service.get_input_config(db)
    if not folder_service.is_configured(config):
        raise ValueError("Input folder is not configured")

    service = folder_service.build_service(config)
    try:
        if filename not in service.list_files(".pdf"):
            raise ValueError(
                f"'{filename}' was not found in the input folder — it may already have been processed or removed"
            )
        invoice, error = _process_new_file(db, service, filename, terminal_status="duplicate_overridden")
    finally:
        service.disconnect()

    if invoice is None:
        raise ValueError(error or "Failed to reprocess this file")

    audit_service.log_action(
        db, "folder.duplicate_overridden", f"Reprocessed duplicate file '{filename}' from watched folder",
        user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
    )
    return invoice


def _watcher_loop() -> None:
    while True:
        interval = DEFAULT_POLL_INTERVAL_SECONDS
        db = SessionLocal()
        try:
            poll_input_folder(db)
            interval = folder_service.get_input_config(db)["poll_interval"]
        except Exception:
            logger.exception("Folder watcher iteration failed")
        finally:
            db.close()
        time.sleep(max(10, interval))


def start_watcher() -> None:
    """Starts the input-folder polling background thread — see this
    module's docstring for why a plain daemon thread rather than
    APScheduler."""
    thread = threading.Thread(target=_watcher_loop, daemon=True)
    thread.start()


# ---------------------------------------------------------------------------
# Output writer
# ---------------------------------------------------------------------------

def _output_filename(invoice: Invoice) -> str:
    supplier_slug = _SUPPLIER_SLUG_RE.sub("", invoice.supplier or "Unknown") or "Unknown"
    return f"{supplier_slug}_{invoice.invoice_date.isoformat()}_{invoice.filename}"


def _output_relative_path(db: Session, invoice: Invoice) -> str:
    start, end, _label = fy_bounds_for(db, invoice.invoice_date)
    fy_segment = f"FY{start.year}" if start.year == end.year else f"FY{start.year}-{str(end.year)[-2:]}"
    month_segment = MONTH_LABELS_FULL[invoice.invoice_date.month - 1]
    return f"{fy_segment}/{month_segment}/{_output_filename(invoice)}"


def write_to_output_folder(db: Session, invoice_id: int, signed_pdf_path: str) -> dict:
    """Writes a signed invoice PDF to the configured output folder. Called
    from POST /invoices/{id}/sign (when enabled and behaviour includes
    folder output) and from the invoice detail page's manual "Export to
    output folder" button. Never raises — a folder-write failure shouldn't
    break the signing flow that triggered it; returns
    {'written', 'path', 'error'} instead."""
    config = folder_service.get_output_config(db)
    if not config["enabled"] or config["behaviour"] == "browser_only":
        return {"written": False, "path": None, "error": None}

    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        return {"written": False, "path": None, "error": "Invoice not found"}
    if not signed_pdf_path or not os.path.exists(signed_pdf_path):
        return {"written": False, "path": None, "error": "Signed PDF file is missing from storage"}

    relative_path = _output_relative_path(db, invoice)

    try:
        service = folder_service.build_service(config)
    except folder_service.FolderConnectionError as exc:
        return _output_failed(db, invoice, f"Failed to connect to the output folder: {exc}")

    try:
        with open(signed_pdf_path, "rb") as f:
            content = f.read()
        service.write_file(relative_path, content)
    except Exception as exc:
        logger.exception("Failed to write signed PDF for invoice %s to output folder", invoice.id)
        return _output_failed(db, invoice, f"Failed to save '{invoice.filename}' to the output folder: {exc}", exc)
    finally:
        service.disconnect()

    notification_service.notify_admins(
        db, type="folder_output_written",
        title="Signed PDF saved to output folder",
        message=f"Signed PDF saved to output folder: {relative_path}",
        link=f"/invoices/{invoice.id}",
        severity="info",
    )
    audit_service.log_action(
        db, "folder.output_written",
        f"Signed PDF for invoice '{invoice.filename}' saved to output folder: {relative_path}",
        affected_table="invoices", affected_record_id=invoice.id,
    )
    return {"written": True, "path": relative_path, "error": None}


def _output_failed(db: Session, invoice: Invoice, message: str, exc: Exception | None = None) -> dict:
    error_service.log_error(
        db, "error", "folder_watcher", message,
        stack_trace=traceback.format_exc() if exc else None,
    )
    notification_service.notify_admins(
        db, type="folder_output_failed",
        title="Could not save signed PDF to output folder",
        message=f"{message} You can retry from the invoice's detail page.",
        link=f"/invoices/{invoice.id}",
        severity="error",
    )
    audit_service.log_action(
        db, "folder.output_failed", message,
        affected_table="invoices", affected_record_id=invoice.id,
    )
    return {"written": False, "path": None, "error": message}
