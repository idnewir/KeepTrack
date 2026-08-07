"""Invoice endpoints: upload with AI extraction, review, list, update, sign, and delete."""
import os
import traceback
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from database import get_db
from models.category import Category
from models.invoice import Invoice
from models.invoice_file import InvoiceFile
from models.planned_project import PlannedProject
from models.schemas import InvoiceConfirmRequest, InvoiceOut, InvoiceSignRequest, InvoiceUpdate, PaginatedResponse
from models.user import User
from services import audit_service, error_service, financial_year_service as fy_service
from services.ai_provider_service import extract_invoice_data
from services.ai_service import check_duplicate
from services.export_pdf_service import generate_table_export_pdf
from services.preview_service import render_pdf_first_page_png
from services.reconciliation_service import mark_reconciliation_stale
from services.settings_service import get_site_name, is_signing_enabled
from services.signing_service import sign_invoice_pdf
from services.storage_service import save_invoice_pdf
from utils.csv_export import csv_response
from utils.deps import get_current_user, require_module, require_standard
from utils.file_validation import MAX_INVOICE_PDF_BYTES, looks_like_pdf, sanitise_filename
from utils.pagination import paginate

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _invoice_to_out(db: Session, invoice: Invoice, project_names: dict[int, str] | None = None) -> dict:
    """InvoiceOut, plus project_name resolved either from a pre-fetched batch
    (list_invoices) or a one-off lookup (single-invoice endpoints)."""
    project_name = None
    if invoice.project_id is not None:
        if project_names is not None:
            project_name = project_names.get(invoice.project_id)
        else:
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
    }


def _filtered_invoices_query(
    db: Session,
    category_id: int | None,
    date_from: date | None,
    date_to: date | None,
    reviewed: bool | None,
    signed: str | None = None,
    project: str | None = None,
    historical: bool | None = None,
    import_batch: str | None = None,
):
    query = db.query(Invoice).filter(Invoice.deleted.is_(False))

    if category_id is not None:
        query = query.filter(Invoice.category_id == category_id)
    if date_from is not None:
        query = query.filter(Invoice.invoice_date >= date_from)
    if date_to is not None:
        query = query.filter(Invoice.invoice_date <= date_to)
    if reviewed is not None:
        query = query.filter(Invoice.reviewed == reviewed)
    if historical is not None:
        query = query.filter(Invoice.is_historical == historical)
    if import_batch:
        query = query.filter(Invoice.import_batch_id == import_batch)
    # "Signed" mirrors InvoicesPage's own badge logic (see frontend
    # InvoicesPage.jsx): an unreviewed invoice is neither signed nor
    # unsigned, so "unsigned" only ever means "reviewed but not signed" —
    # this used to be a client-side post-filter over the whole unpaginated
    # list, which no longer works once the list itself is paginated
    # server-side, so it's now a real query filter with the same semantics.
    # Historical invoices were imported without PDFs and are never eligible
    # for signing, so "unsigned" excludes them (see docs/decisions-log.md).
    if signed == "signed":
        query = query.filter(Invoice.signed.is_(True))
    elif signed == "unsigned":
        query = query.filter(
            Invoice.reviewed.is_(True),
            Invoice.signed.is_(False),
            Invoice.is_historical.is_(False),
        )

    # "unlinked" is a sentinel (like signed's "signed"/"unsigned" above)
    # rather than overloading project_id=None, since None already means "no
    # filter" for every other numeric filter param here.
    if project == "unlinked":
        query = query.filter(Invoice.project_id.is_(None))
    elif project:
        query = query.filter(Invoice.project_id == int(project))

    return query.order_by(Invoice.invoice_date.desc(), Invoice.id.desc())


def _filters_subtitle(category_name: str | None, date_from: date | None, date_to: date | None, reviewed: bool | None) -> str | None:
    parts = []
    if date_from or date_to:
        parts.append(f"{date_from or '…'} to {date_to or '…'}")
    if category_name:
        parts.append(f"Category: {category_name}")
    if reviewed is not None:
        parts.append("Reviewed only" if reviewed else "Unreviewed only")
    return " · ".join(parts) if parts else None


@router.post("/upload", response_model=list[InvoiceOut], status_code=status.HTTP_201_CREATED)
def upload_invoices(
    files: list[UploadFile],
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    categories = db.query(Category).filter(Category.active.is_(True)).order_by(Category.name).all()
    category_ids = {c.id for c in categories}

    created: list[Invoice] = []

    for upload in files:
        safe_filename = sanitise_filename(upload.filename or "invoice.pdf")
        if not safe_filename.lower().endswith(".pdf"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{safe_filename}' is not a PDF")

        content = upload.file.read()
        if len(content) > MAX_INVOICE_PDF_BYTES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"'{safe_filename}' is too large (max {MAX_INVOICE_PDF_BYTES // (1024 * 1024)} MB)",
            )
        # The Content-Type header and filename extension are both
        # client-supplied and prove nothing on their own — this checks the
        # file's actual magic bytes instead, per the security requirement.
        if not looks_like_pdf(content):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{safe_filename}' is not a valid PDF file")

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
            reviewed=False,
            created_by=user.id,
        )
        db.add(invoice)
        db.flush()  # assigns invoice.id without ending the transaction

        db.add(InvoiceFile(invoice_id=invoice.id, original_path=stored_path))
        created.append(invoice)

    db.commit()
    for invoice in created:
        db.refresh(invoice)
        audit_service.log_action(
            db, "invoice.uploaded", f"Uploaded invoice '{invoice.filename}'",
            user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
        )

    return [_invoice_to_out(db, invoice) for invoice in created]


@router.get("", response_model=PaginatedResponse[InvoiceOut])
def list_invoices(
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    reviewed: bool | None = None,
    signed: str | None = None,
    project: str | None = None,
    historical: bool | None = None,
    import_batch: str | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = _filtered_invoices_query(db, category_id, date_from, date_to, reviewed, signed, project, historical, import_batch)
    items, pagination = paginate(query, page, per_page)

    project_ids = {inv.project_id for inv in items if inv.project_id is not None}
    project_names = (
        dict(db.query(PlannedProject.id, PlannedProject.name).filter(PlannedProject.id.in_(project_ids)).all())
        if project_ids
        else {}
    )
    data = [_invoice_to_out(db, inv, project_names) for inv in items]
    return {"data": data, "pagination": pagination}


@router.get("/export/csv")
def export_invoices_csv(
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    reviewed: bool | None = None,
    signed: str | None = None,
    project: str | None = None,
    historical: bool | None = None,
    import_batch: str | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    invoices = _filtered_invoices_query(db, category_id, date_from, date_to, reviewed, signed, project, historical, import_batch).all()
    categories = {c.id: c.name for c in db.query(Category).all()}

    rows = [
        [
            inv.invoice_date.isoformat(),
            inv.supplier,
            f"{inv.amount:.2f}",
            categories.get(inv.category_id, "Uncategorised"),
            "Yes" if inv.reviewed else "No",
            "N/A" if inv.is_historical else ("Yes" if inv.signed else "No"),
            "Yes" if inv.duplicate_flag else "No",
            inv.notes or "",
        ]
        for inv in invoices
    ]
    return csv_response(
        "invoices_export.csv",
        ["Date", "Supplier", "Amount", "Category", "Reviewed", "Signed", "Possible Duplicate", "Notes"],
        rows,
    )


@router.get("/export/pdf")
def export_invoices_pdf(
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    reviewed: bool | None = None,
    signed: str | None = None,
    project: str | None = None,
    historical: bool | None = None,
    import_batch: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoices = _filtered_invoices_query(db, category_id, date_from, date_to, reviewed, signed, project, historical, import_batch).all()
    categories = {c.id: c.name for c in db.query(Category).all()}
    category_name = categories.get(category_id) if category_id is not None else None

    rows = [
        [
            inv.invoice_date.isoformat(),
            inv.supplier,
            f"£{inv.amount:,.2f}",
            categories.get(inv.category_id, "Uncategorised"),
            "Yes" if inv.reviewed else "No",
            "N/A" if inv.is_historical else ("Yes" if inv.signed else "No"),
            inv.notes or "",
        ]
        for inv in invoices
    ]
    pdf_bytes = generate_table_export_pdf(
        title="Invoices Export",
        subtitle=_filters_subtitle(category_name, date_from, date_to, reviewed),
        site_name=get_site_name(db),
        columns=["Date", "Supplier", "Amount", "Category", "Reviewed", "Signed", "Notes"],
        rows=rows,
        generated_by_username=user.username,
        generated_at=datetime.now(timezone.utc),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="invoices_export.pdf"'},
    )


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return _invoice_to_out(db, invoice)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    old_invoice_date = invoice.invoice_date
    changed_fields: dict = {}

    if payload.invoice_date is not None and payload.invoice_date != invoice.invoice_date:
        changed_fields["invoice_date"] = {"before": invoice.invoice_date.isoformat(), "after": payload.invoice_date.isoformat()}
        invoice.invoice_date = payload.invoice_date
    if payload.supplier is not None and payload.supplier != invoice.supplier:
        changed_fields["supplier"] = {"before": invoice.supplier, "after": payload.supplier}
        invoice.supplier = payload.supplier
    if payload.amount is not None and payload.amount != invoice.amount:
        changed_fields["amount"] = {"before": str(invoice.amount), "after": str(payload.amount)}
        invoice.amount = payload.amount
    if payload.category_id is not None and payload.category_id != invoice.category_id:
        changed_fields["category_id"] = {"before": invoice.category_id, "after": payload.category_id}
        invoice.category_id = payload.category_id
    if payload.notes is not None and payload.notes != invoice.notes:
        changed_fields["notes"] = {"before": invoice.notes, "after": payload.notes}
        invoice.notes = payload.notes
    if payload.project_id is not None and payload.project_id != invoice.project_id:
        project = db.get(PlannedProject, payload.project_id)
        if project is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        changed_fields["project_id"] = {"before": invoice.project_id, "after": payload.project_id}
        invoice.project_id = payload.project_id

    db.commit()
    db.refresh(invoice)

    if changed_fields:
        # Only a reviewed (confirmed) invoice counts toward any month's
        # calculated balance, so an edit to one still awaiting review can't
        # have made a past reconciliation stale.
        if invoice.reviewed:
            old_fy = fy_service.get_or_create_financial_year(db, old_invoice_date)
            mark_reconciliation_stale(db, old_invoice_date, old_fy.id, "Invoice edited after reconciliation")
            if invoice.invoice_date != old_invoice_date:
                new_fy = fy_service.get_or_create_financial_year(db, invoice.invoice_date)
                mark_reconciliation_stale(db, invoice.invoice_date, new_fy.id, "Invoice edited after reconciliation")

        audit_service.log_action(
            db, "invoice.edited", f"Edited invoice '{invoice.filename}' ({', '.join(changed_fields)})",
            user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
            metadata={"changed_fields": changed_fields},
        )
    return _invoice_to_out(db, invoice)


@router.post("/{invoice_id}/confirm", response_model=InvoiceOut)
def confirm_invoice(
    invoice_id: int,
    payload: InvoiceConfirmRequest = InvoiceConfirmRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    linked_project = None
    if payload.project_id is not None and payload.project_id != invoice.project_id:
        linked_project = db.get(PlannedProject, payload.project_id)
        if linked_project is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
        invoice.project_id = payload.project_id

    invoice.reviewed = True
    db.commit()
    db.refresh(invoice)

    fy = fy_service.get_or_create_financial_year(db, invoice.invoice_date)
    mark_reconciliation_stale(db, invoice.invoice_date, fy.id, "Invoice confirmed after reconciliation")

    # This app has a single review/confirm step (there is no separate
    # "reviewed" vs. "confirmed" state in the data model — both describe the
    # same POST /invoices/{id}/confirm action), so this logs invoice.reviewed
    # only, rather than emitting two audit entries for one action. See
    # docs/decisions-log.md.
    description = f"Reviewed and confirmed invoice '{invoice.filename}'"
    if linked_project is not None:
        description += f", linked to project '{linked_project.name}'"
    audit_service.log_action(
        db, "invoice.reviewed", description,
        user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
    )
    return _invoice_to_out(db, invoice)


@router.post("/{invoice_id}/unlink-project", response_model=InvoiceOut)
def unlink_invoice_project(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if invoice.project_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invoice is not linked to a project")

    project = db.get(PlannedProject, invoice.project_id)
    invoice.project_id = None
    db.commit()
    db.refresh(invoice)

    audit_service.log_action(
        db, "invoice.project_unlinked",
        f"Unlinked invoice '{invoice.filename}' from project '{project.name if project else '?'}'",
        user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
    )
    return _invoice_to_out(db, invoice)


@router.post("/{invoice_id}/sign", response_model=InvoiceOut, dependencies=[Depends(require_module("signing_export"))])
def sign_invoice(
    invoice_id: int,
    payload: InvoiceSignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    if not is_signing_enabled(db):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signing is currently turned off in Settings")

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    invoice_file = (
        db.query(InvoiceFile)
        .filter(InvoiceFile.invoice_id == invoice_id)
        .order_by(InvoiceFile.uploaded_at.desc())
        .first()
    )
    if invoice_file is None or not os.path.exists(invoice_file.original_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Original PDF not found for this invoice")

    was_already_signed = invoice.signed

    try:
        signed_path = sign_invoice_pdf(
            db,
            original_path=invoice_file.original_path,
            signature_image=payload.signature_image,
            signed_date=payload.date,
            page_number=payload.page,
            x_pct=payload.x,
            y_pct=payload.y,
            width_pct=payload.width,
            height_pct=payload.height,
            signer_name=user.display_name or user.username,
            additional_text=payload.additional_text,
        )
    except ValueError as exc:
        error_service.log_error(
            db, "warning", "pdf_signing", f"Could not sign invoice '{invoice.filename}': {exc}",
            user_id=user.id,
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except RuntimeError as exc:
        error_service.log_error(
            db, "error", "pdf_signing", f"Could not sign invoice '{invoice.filename}': {exc}",
            stack_trace=traceback.format_exc(), user_id=user.id,
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not sign PDF: {exc}") from exc

    # The original file (referenced by invoice_file.original_path) is never
    # touched — sign_invoice_pdf always writes a brand new file.
    invoice.signed = True
    invoice.signed_pdf_path = signed_path
    db.commit()
    db.refresh(invoice)

    if was_already_signed:
        audit_service.log_action(
            db, "invoice.resigned", f"Re-signed invoice '{invoice.filename}'",
            user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
        )
    else:
        audit_service.log_action(
            db, "invoice.signed", f"Signed invoice '{invoice.filename}'",
            user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
        )
    return _invoice_to_out(db, invoice)


@router.get("/{invoice_id}/original-pdf")
def get_original_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    invoice_file = (
        db.query(InvoiceFile)
        .filter(InvoiceFile.invoice_id == invoice_id)
        .order_by(InvoiceFile.uploaded_at.desc())
        .first()
    )
    if invoice_file is None or not os.path.exists(invoice_file.original_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Original PDF not found for this invoice")

    return FileResponse(
        invoice_file.original_path,
        media_type="application/pdf",
        filename=invoice.filename,
    )


@router.get("/{invoice_id}/preview")
def get_invoice_preview(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    invoice_file = (
        db.query(InvoiceFile)
        .filter(InvoiceFile.invoice_id == invoice_id)
        .order_by(InvoiceFile.uploaded_at.desc())
        .first()
    )
    if invoice_file is None or not os.path.exists(invoice_file.original_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Original PDF not found for this invoice")

    try:
        png_bytes = render_pdf_first_page_png(invoice_file.original_path)
    except Exception as exc:
        error_service.log_error(
            db, "error", "pdf_processing", f"Could not render a preview of invoice '{invoice.filename}': {exc}",
            stack_trace=traceback.format_exc(), user_id=user.id,
        )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not render a preview of this PDF") from exc

    return Response(content=png_bytes, media_type="image/png")


@router.get("/{invoice_id}/signed-pdf")
def get_signed_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if not invoice.signed or not invoice.signed_pdf_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invoice has not been signed")
    if not os.path.exists(invoice.signed_pdf_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Signed PDF file is missing from storage")

    return FileResponse(
        invoice.signed_pdf_path,
        media_type="application/pdf",
        filename=f"signed_{invoice.filename}",
    )


@router.delete("/{invoice_id}", response_model=InvoiceOut)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    # Discarding a not-yet-reviewed upload is part of the review workflow
    # (available to Standard and Admin, like the rest of review). Deleting an
    # already-reviewed, committed record is a data-integrity action reserved
    # for Admins — see docs/decisions-log.md.
    if invoice.reviewed and user.role not in ("admin", "superadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required to delete a reviewed invoice")

    invoice.deleted = True
    db.commit()
    db.refresh(invoice)

    if invoice.reviewed:
        fy = fy_service.get_or_create_financial_year(db, invoice.invoice_date)
        mark_reconciliation_stale(db, invoice.invoice_date, fy.id, "Invoice deleted after reconciliation")

    audit_service.log_action(
        db, "invoice.deleted", f"Deleted invoice '{invoice.filename}'",
        user_id=user.id, affected_table="invoices", affected_record_id=invoice.id,
    )
    return _invoice_to_out(db, invoice)
