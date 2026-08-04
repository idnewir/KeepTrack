"""Invoice endpoints: upload with AI extraction, review, list, update, and delete."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from models.category import Category
from models.invoice import Invoice
from models.invoice_file import InvoiceFile
from models.schemas import InvoiceOut, InvoiceUpdate
from models.user import User
from services.ai_service import check_duplicate, extract_invoice_data
from services.storage_service import save_invoice_pdf
from utils.deps import get_current_user, require_standard

router = APIRouter(prefix="/invoices", tags=["invoices"])


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
        if upload.content_type != "application/pdf" and not (upload.filename or "").lower().endswith(".pdf"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{upload.filename}' is not a PDF")

        content = upload.file.read()
        stored_path = save_invoice_pdf(upload.filename or "invoice.pdf", content)

        extracted = extract_invoice_data(content, categories)
        category_id = extracted["category_id"] if extracted["category_id"] in category_ids else None
        duplicate_flag = check_duplicate(db, extracted["supplier"], extracted["amount"], extracted["invoice_date"])

        invoice = Invoice(
            filename=upload.filename or "invoice.pdf",
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

    return created


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    reviewed: bool | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
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

    return query.order_by(Invoice.invoice_date.desc()).all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return invoice


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    if payload.invoice_date is not None:
        invoice.invoice_date = payload.invoice_date
    if payload.supplier is not None:
        invoice.supplier = payload.supplier
    if payload.amount is not None:
        invoice.amount = payload.amount
    if payload.category_id is not None:
        invoice.category_id = payload.category_id
    if payload.notes is not None:
        invoice.notes = payload.notes

    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/confirm", response_model=InvoiceOut)
def confirm_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    invoice.reviewed = True
    db.commit()
    db.refresh(invoice)
    return invoice


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
    return invoice
