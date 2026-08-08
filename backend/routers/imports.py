"""Bulk historical invoice import: CSV (row-per-invoice, no AI) and PDF
(same AI extraction pipeline as a normal upload). Both skip the ordinary
review/sign/export workflow — historical invoices are marked reviewed=True,
signed=False straight away (CSV) or reuse the existing unreviewed ->
POST /invoices/{id}/confirm flow with signing forced off by the frontend
(PDF) — and are grouped by a generated import_batch_id so a whole import can
be listed, inspected, and deleted together. See docs/decisions-log.md.
"""
import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from models.audit_log import AuditLog
from models.category import Category
from models.import_batch import ImportBatch
from models.invoice import Invoice
from models.invoice_file import InvoiceFile
from models.planned_project import PlannedProject
from models.schemas import (
    CSVImportResultOut,
    CSVPreviewOut,
    ImportBatchDeleteResult,
    ImportBatchDetailOut,
    ImportBatchOut,
    InvoiceOut,
)
from models.user import User
from services import audit_service, import_service, rules_service
from services.ai_provider_service import extract_invoice_data
from services.ai_service import check_duplicate
from services.financial_year_service import get_or_create_financial_year
from services.reconciliation_service import mark_reconciliation_stale
from services.storage_service import save_invoice_pdf
from utils.deps import get_current_user, require_admin, require_module, require_standard
from utils.file_validation import MAX_INVOICE_PDF_BYTES, looks_like_pdf, sanitise_filename

router = APIRouter(prefix="/imports", tags=["imports"], dependencies=[Depends(require_module("bulk_import"))])

MAX_CSV_BYTES = 10 * 1024 * 1024  # 10 MB comfortably covers years of invoice rows


# Not reused from routers/invoices.py — this project prefers explicit
# duplication over a cross-router import for a single small helper (see
# models/audit_log.py's docstring for the same reasoning applied elsewhere).
def _invoice_to_out(db: Session, invoice: Invoice) -> dict:
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


def _batch_to_out(db: Session, batch: ImportBatch) -> dict:
    importer = db.get(User, batch.imported_by)
    return {
        "id": batch.id,
        "batch_id": batch.batch_id,
        "import_type": batch.import_type,
        "filename": batch.filename,
        "total_records": batch.total_records,
        "imported_records": batch.imported_records,
        "failed_records": batch.failed_records,
        "status": batch.status,
        "imported_by": batch.imported_by,
        "imported_by_username": importer.username if importer else None,
        "imported_at": batch.imported_at,
        "notes": batch.notes,
    }


def _get_batch_or_404(db: Session, batch_id: str) -> ImportBatch:
    batch = db.query(ImportBatch).filter(ImportBatch.batch_id == batch_id).first()
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import batch not found")
    return batch


_MAPPABLE_FIELDS = ("date", "supplier", "amount", "category", "notes", "duplicate_flag", "filename")
_CSV_PREVIEW_ROWS = 5


@router.post("/csv/preview", response_model=CSVPreviewOut)
def preview_csv(
    file: UploadFile = File(...),
    _user: User = Depends(require_standard),
):
    """Headers, the first few data rows, and the auto-detected column
    mapping — lets the frontend show a preview and a mapping UI before
    committing to POST /imports/csv. Does not touch the database."""
    content = file.file.read()
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"CSV file is too large (max {MAX_CSV_BYTES // (1024 * 1024)} MB)",
        )

    headers, data_rows = import_service.parse_csv_text(content)
    if not headers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV file is empty or has no header row")

    return {
        "headers": headers,
        "rows": data_rows[:_CSV_PREVIEW_ROWS],
        "column_map": import_service.detect_column_map(headers),
    }


@router.post("/csv", response_model=CSVImportResultOut, status_code=status.HTTP_201_CREATED)
def import_csv(
    file: UploadFile = File(...),
    # Optional JSON object of {field_name: column_index}, e.g.
    # '{"date": 2, "supplier": 3}' — lets the frontend's column-mapping UI
    # (shown when a CSV's headers don't auto-detect cleanly) override or
    # fill in individual fields. Anything not present here falls back to
    # auto-detection from the header row.
    column_map: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    safe_filename = sanitise_filename(file.filename or "import.csv")
    content = file.file.read()
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"CSV file is too large (max {MAX_CSV_BYTES // (1024 * 1024)} MB)",
        )

    headers, data_rows = import_service.parse_csv_text(content)
    if not headers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CSV file is empty or has no header row")

    effective_map = import_service.detect_column_map(headers)
    if column_map:
        try:
            raw_override = json.loads(column_map)
            if not isinstance(raw_override, dict):
                raise ValueError
            override = {
                field: int(index)
                for field, index in raw_override.items()
                if field in _MAPPABLE_FIELDS and index is not None and index != "" and 0 <= int(index) < len(headers)
            }
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "column_map must be a JSON object mapping field names to column indexes",
            ) from exc
        effective_map = {**effective_map, **override}

    if not {"date", "supplier", "amount"} <= effective_map.keys():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Could not detect the required Date, Supplier, and Amount columns in this CSV's header row",
        )

    categories = db.query(Category).filter(Category.active.is_(True)).order_by(Category.name).all()

    batch_id = uuid.uuid4().hex
    created: list[Invoice] = []
    skipped: list[dict] = []
    duplicates: list[dict] = []
    touched_months: set[tuple[int, int, int]] = set()

    for row_number, row in enumerate(data_rows, start=2):  # row 1 is the header
        parsed = import_service.parse_row(row, effective_map, categories)
        if parsed["skip_reason"]:
            skipped.append({"row": row_number, "reason": parsed["skip_reason"]})
            continue

        # Transaction rules take priority over the CSV's own Category column
        # — see services/rules_service.py and docs/decisions-log.md. This is
        # the one import path with no AI step, so it's rules_service's only
        # chance to categorise a historical row by supplier.
        matched_rule = rules_service.find_matching_rule(db, parsed["supplier"])
        if matched_rule is not None:
            parsed["category_id"] = matched_rule.category_id
            note = f"Category set by rule: {matched_rule.name}"
            parsed["notes"] = f"{parsed['notes']}\n\n{note}" if parsed["notes"] else note

        invoice_date = parsed["invoice_date"] or date.today()
        invoice = Invoice(
            filename=parsed["filename"] or f"{safe_filename} (row {row_number})",
            invoice_date=invoice_date,
            supplier=parsed["supplier"] or "Unknown supplier",
            amount=parsed["amount"],
            category_id=parsed["category_id"],
            notes=parsed["notes"],
            duplicate_flag=parsed["duplicate_flag"],
            is_historical=True,
            reviewed=True,
            signed=False,
            import_batch_id=batch_id,
            created_by=user.id,
        )
        db.add(invoice)
        created.append(invoice)

        if parsed["duplicate_flag"]:
            duplicates.append({
                "row": row_number,
                "reason": f"{parsed['supplier']} — £{parsed['amount']:.2f} on {invoice_date.isoformat()}",
            })

        fy = get_or_create_financial_year(db, invoice_date)
        touched_months.add((invoice_date.year, invoice_date.month, fy.id))

    batch_status = "complete" if not skipped else ("partial" if created else "failed")
    batch = ImportBatch(
        batch_id=batch_id,
        import_type="csv",
        filename=safe_filename,
        total_records=len(data_rows),
        imported_records=len(created),
        failed_records=len(skipped),
        status=batch_status,
        imported_by=user.id,
        notes=f"{len(duplicates)} row(s) flagged as possible duplicates" if duplicates else None,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # Historical invoices are reviewed=True from creation (they skip the
    # review stage entirely), so — like POST /invoices/{id}/confirm — any
    # month a reconciliation already exists for is now stale.
    for year, month, fy_id in touched_months:
        mark_reconciliation_stale(db, date(year, month, 1), fy_id, "Historical invoices imported after reconciliation")

    audit_service.log_action(
        db, "import.csv",
        f"Imported {len(created)} historical invoice(s) from CSV '{safe_filename}' (batch {batch_id})",
        user_id=user.id, affected_table="import_batches", affected_record_id=batch.id,
        metadata={"batch_id": batch_id, "imported": len(created), "skipped": len(skipped), "duplicates": len(duplicates)},
    )

    return {
        "batch": _batch_to_out(db, batch),
        "total_rows": len(data_rows),
        "imported": len(created),
        "skipped": skipped,
        "duplicates_flagged": duplicates,
    }


@router.post("/pdf", response_model=list[InvoiceOut], status_code=status.HTTP_201_CREATED)
def import_pdfs(
    files: list[UploadFile],
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No PDF files were provided")

    categories = db.query(Category).filter(Category.active.is_(True)).order_by(Category.name).all()
    category_ids = {c.id for c in categories}

    batch_id = uuid.uuid4().hex
    created: list[Invoice] = []
    failed_count = 0

    for upload in files:
        safe_filename = sanitise_filename(upload.filename or "invoice.pdf")
        content = upload.file.read()
        # Same validation as a normal upload (backend/routers/invoices.py) —
        # a bad file in a bulk batch is skipped (counted as failed) rather
        # than aborting the whole import, so one corrupt PDF among fifty
        # doesn't block the other forty-nine.
        if not safe_filename.lower().endswith(".pdf") or len(content) > MAX_INVOICE_PDF_BYTES or not looks_like_pdf(content):
            failed_count += 1
            continue

        stored_path = save_invoice_pdf(db, safe_filename, content)
        extracted = extract_invoice_data(content, categories, db)
        category_id = extracted["category_id"] if extracted["category_id"] in category_ids else None
        duplicate_flag = check_duplicate(db, extracted["supplier"], extracted["amount"], extracted["invoice_date"])

        invoice = Invoice(
            filename=safe_filename,
            invoice_date=extracted["invoice_date"] or date.today(),
            supplier=extracted["supplier"] or "",
            amount=extracted["amount"] or 0,
            category_id=category_id,
            notes=extracted["notes"],
            duplicate_flag=duplicate_flag,
            is_historical=True,
            reviewed=False,
            signed=False,
            import_batch_id=batch_id,
            created_by=user.id,
        )
        db.add(invoice)
        db.flush()  # assigns invoice.id without ending the transaction

        db.add(InvoiceFile(invoice_id=invoice.id, original_path=stored_path))
        created.append(invoice)

    if not created and failed_count == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No PDF files were provided")

    batch_status = "complete" if failed_count == 0 else ("partial" if created else "failed")
    batch = ImportBatch(
        batch_id=batch_id,
        import_type="pdf",
        filename=None,
        total_records=len(files),
        imported_records=len(created),
        failed_records=failed_count,
        status=batch_status,
        imported_by=user.id,
        notes="Historical PDF import — each invoice still needs review before it's fully confirmed",
    )
    db.add(batch)
    db.commit()
    for invoice in created:
        db.refresh(invoice)

    audit_service.log_action(
        db, "import.pdf",
        f"Uploaded {len(created)} historical PDF invoice(s) for review (batch {batch_id})",
        user_id=user.id, affected_table="import_batches", affected_record_id=batch.id,
        metadata={"batch_id": batch_id, "imported": len(created), "failed": failed_count},
    )

    return [_invoice_to_out(db, invoice) for invoice in created]


@router.get("", response_model=list[ImportBatchOut])
def list_import_batches(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    batches = db.query(ImportBatch).order_by(ImportBatch.imported_at.desc()).all()
    return [_batch_to_out(db, b) for b in batches]


@router.get("/{batch_id}", response_model=ImportBatchDetailOut)
def get_import_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    batch = _get_batch_or_404(db, batch_id)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.import_batch_id == batch_id, Invoice.deleted.is_(False))
        .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
        .all()
    )
    return {"batch": _batch_to_out(db, batch), "invoices": [_invoice_to_out(db, inv) for inv in invoices]}


def _invoice_edited_since_import(db: Session, invoice_id: int) -> bool:
    """An invoice counts as "manually edited since import" if PUT
    /invoices/{id} has ever touched it — whether that happened during the
    PDF review step (the user corrected what AI extracted) or later from
    the invoice detail page. Either way, that's data the user has actively
    verified or changed, not just what the import wrote — protected from
    the batch delete below. See docs/decisions-log.md."""
    return (
        db.query(AuditLog)
        .filter(
            AuditLog.action_type == "invoice.edited",
            AuditLog.affected_table == "invoices",
            AuditLog.affected_record_id == invoice_id,
        )
        .first()
        is not None
    )


@router.delete("/{batch_id}", response_model=ImportBatchDeleteResult)
def delete_import_batch(
    batch_id: str,
    dry_run: bool = False,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    batch = _get_batch_or_404(db, batch_id)
    invoices = (
        db.query(Invoice)
        .filter(Invoice.import_batch_id == batch_id, Invoice.deleted.is_(False))
        .all()
    )
    deletable = [inv for inv in invoices if not _invoice_edited_since_import(db, inv.id)]
    protected = [inv for inv in invoices if inv not in deletable]

    if dry_run:
        return {
            "batch_id": batch_id,
            "dry_run": True,
            "deleted_count": len(deletable),
            "protected_count": len(protected),
        }

    batch_pk = batch.id
    for invoice in deletable:
        invoice.deleted = True
    db.delete(batch)
    db.commit()

    audit_service.log_action(
        db, "import_batch.deleted",
        f"Deleted import batch '{batch_id}' ({len(deletable)} invoice(s) removed, {len(protected)} protected — edited since import)",
        user_id=admin.id, affected_table="import_batches", affected_record_id=batch_pk,
        metadata={"batch_id": batch_id, "deleted": len(deletable), "protected": len(protected)},
    )

    return {
        "batch_id": batch_id,
        "dry_run": False,
        "deleted_count": len(deletable),
        "protected_count": len(protected),
    }
