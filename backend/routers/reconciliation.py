"""Monthly reconciliation endpoints: compare the calculated balance against the actual bank balance."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models.financial_year import FinancialYear
from models.monthly_reconciliation import MonthlyReconciliation
from models.schemas import (
    PaginatedResponse,
    ReconciliationCreate,
    ReconciliationOut,
    ReconciliationMonthOut,
    ReconciliationUpdate,
)
from models.user import User
from services import audit_service, financial_year_service as fy_service
from services.date_service import get_app_start_date
from services.export_pdf_service import generate_table_export_pdf
from services.reconciliation_service import calculated_balance_for_month, suggest_reason
from services.settings_service import get_site_name
from utils.csv_export import csv_response
from utils.deps import get_current_user, require_admin, require_module, require_standard
from utils.pagination import paginate

router = APIRouter(
    prefix="/reconciliation", tags=["reconciliation"], dependencies=[Depends(require_module("reconciliation"))]
)


def _filtered_reconciliations_query(db: Session, financial_year_id: int | None, is_stale: bool | None = None):
    """Deliberately filters on the raw app_start_date setting, not
    date_service.get_effective_start_date() — that helper's fallback (no
    app_start_date set) resolves to the start of the financial year
    containing *today*, which is the right floor for a "today-relative"
    check (e.g. the dashboard's overdue-reconciliation scan, or the
    reconciliation page's month-tile picker, both of which only ever look at
    the current FY) but the wrong one here: this query can be asked about
    any financial year via financial_year_id, including ones entirely in the
    past. Applying today's-FY-start as a blanket floor would incorrectly
    hide a genuinely-reconciled historical year's rows (none of which are
    ever >= today's FY start). A reconciliation row can never predate its
    own financial year's start_date (enforced at creation below), so
    filtering on app_start_date alone — only when it's actually set — already
    yields "the later of the FY's own start and the app start date" for
    whichever FY is being asked about, without needing to know which FY that
    is. See docs/decisions-log.md.
    """
    query = db.query(MonthlyReconciliation)
    app_start_date = get_app_start_date(db)
    if app_start_date is not None:
        query = query.filter(MonthlyReconciliation.month >= app_start_date)
    if financial_year_id is not None:
        query = query.filter(MonthlyReconciliation.financial_year_id == financial_year_id)
    if is_stale is not None:
        query = query.filter(MonthlyReconciliation.is_stale.is_(is_stale))
    return query.order_by(MonthlyReconciliation.month.desc())


def _to_out(db: Session, row: MonthlyReconciliation) -> dict:
    reconciler = db.get(User, row.reconciled_by)
    editor = db.get(User, row.edited_by) if row.edited_by is not None else None

    # A stale reconciliation's stored calculated_balance/discrepancy are
    # frozen from submission time — recompute them live against today's
    # contributions/invoices so the displayed figures actually reflect what
    # changed. A non-stale reconciliation's stored figures are still current
    # by definition, so skip the extra query. See docs/decisions-log.md.
    if row.is_stale:
        fy = db.get(FinancialYear, row.financial_year_id)
        current_calculated_balance = calculated_balance_for_month(db, fy, row.month)
    else:
        current_calculated_balance = row.calculated_balance
    current_discrepancy = row.actual_balance - current_calculated_balance

    return {
        "id": row.id,
        "financial_year_id": row.financial_year_id,
        "month": row.month,
        "calculated_balance": row.calculated_balance,
        "actual_balance": row.actual_balance,
        "discrepancy": row.discrepancy,
        "discrepancy_notes": row.discrepancy_notes,
        "suggested_reason": row.suggested_reason,
        "reconciled_by": row.reconciled_by,
        "reconciled_by_username": reconciler.username if reconciler else None,
        "reconciled_at": row.reconciled_at,
        "edited_by": row.edited_by,
        "edited_by_username": editor.username if editor else None,
        "edited_at": row.edited_at,
        "edit_reason": row.edit_reason,
        "is_stale": row.is_stale,
        "stale_reason": row.stale_reason,
        "stale_since": row.stale_since,
        "original_calculated_balance": row.calculated_balance,
        "current_calculated_balance": current_calculated_balance,
        "original_discrepancy": row.discrepancy,
        "current_discrepancy": current_discrepancy,
    }


@router.get("", response_model=PaginatedResponse[ReconciliationOut])
def list_reconciliations(
    financial_year_id: int | None = None,
    is_stale: bool | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = _filtered_reconciliations_query(db, financial_year_id, is_stale)
    items, pagination = paginate(query, page, per_page)
    return {"data": [_to_out(db, row) for row in items], "pagination": pagination}


@router.get("/export/csv")
def export_reconciliations_csv(
    financial_year_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    rows_data = [_to_out(db, row) for row in _filtered_reconciliations_query(db, financial_year_id).all()]
    rows = [
        [
            r["month"].strftime("%B %Y"),
            f"{r['calculated_balance']:.2f}",
            f"{r['actual_balance']:.2f}",
            f"{r['discrepancy']:.2f}",
            r["suggested_reason"] or "",
            r["discrepancy_notes"] or "",
            r["reconciled_by_username"] or "",
        ]
        for r in rows_data
    ]
    return csv_response(
        "reconciliation_export.csv",
        ["Month", "Calculated Balance", "Actual Balance", "Discrepancy", "Suggested Reason", "Notes", "Reconciled By"],
        rows,
    )


@router.get("/export/pdf")
def export_reconciliations_pdf(
    financial_year_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows_data = [_to_out(db, row) for row in _filtered_reconciliations_query(db, financial_year_id).all()]
    rows = [
        [
            r["month"].strftime("%B %Y"),
            f"£{r['calculated_balance']:,.2f}",
            f"£{r['actual_balance']:,.2f}",
            f"£{r['discrepancy']:,.2f}",
            r["suggested_reason"] or "",
            r["reconciled_by_username"] or "",
        ]
        for r in rows_data
    ]

    subtitle = None
    if financial_year_id is not None:
        fy = db.get(FinancialYear, financial_year_id)
        if fy is not None:
            subtitle = f"Financial year: {fy.label}"

    pdf_bytes = generate_table_export_pdf(
        title="Reconciliation Export",
        subtitle=subtitle,
        site_name=get_site_name(db),
        columns=["Month", "Calculated Balance", "Actual Balance", "Discrepancy", "Suggested Reason", "Reconciled By"],
        rows=rows,
        generated_by_username=user.username,
        generated_at=datetime.now(timezone.utc),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="reconciliation_export.pdf"'},
    )


@router.get("/{year}/{month}", response_model=ReconciliationMonthOut)
def get_month_reconciliation(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if not 1 <= month <= 12:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Month must be between 1 and 12")

    month_date = date(year, month, 1)
    fy = fy_service.get_or_create_financial_year(db, month_date)

    row = (
        db.query(MonthlyReconciliation)
        .filter(MonthlyReconciliation.financial_year_id == fy.id, MonthlyReconciliation.month == month_date)
        .first()
    )

    calculated_balance = calculated_balance_for_month(db, fy, month_date)

    return {
        "financial_year_id": fy.id,
        "year": year,
        "month": month,
        "month_date": month_date,
        "month_label": f"{fy_service.MONTH_LABELS[month - 1]} {year}",
        "calculated_balance": calculated_balance,
        "reconciled": row is not None,
        "reconciliation": _to_out(db, row) if row is not None else None,
    }


@router.post("", response_model=ReconciliationOut, status_code=status.HTTP_201_CREATED)
def create_reconciliation(
    payload: ReconciliationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    fy = db.get(FinancialYear, payload.financial_year_id)
    if fy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial year not found")

    month_date = date(payload.month.year, payload.month.month, 1)
    if month_date < fy.start_date or month_date > fy.end_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That month falls outside the selected financial year")

    app_start_date = get_app_start_date(db)
    if app_start_date is not None and month_date < app_start_date:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That month is before the app's start date and cannot be reconciled.",
        )

    existing = (
        db.query(MonthlyReconciliation)
        .filter(MonthlyReconciliation.financial_year_id == fy.id, MonthlyReconciliation.month == month_date)
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This month has already been reconciled. Edit the notes instead, or ask an Admin to help correct it.",
        )

    calculated_balance = calculated_balance_for_month(db, fy, month_date)
    discrepancy = payload.actual_balance - calculated_balance

    reconciliation = MonthlyReconciliation(
        financial_year_id=fy.id,
        month=month_date,
        calculated_balance=calculated_balance,
        actual_balance=payload.actual_balance,
        discrepancy=discrepancy,
        suggested_reason=suggest_reason(discrepancy),
        reconciled_by=user.id,
    )
    db.add(reconciliation)
    db.commit()
    db.refresh(reconciliation)

    audit_service.log_action(
        db, "reconciliation.submitted", f"Submitted reconciliation for {month_date.strftime('%B %Y')}",
        user_id=user.id, affected_table="monthly_reconciliations", affected_record_id=reconciliation.id,
    )
    return _to_out(db, reconciliation)


@router.put("/{reconciliation_id}", response_model=ReconciliationOut)
def update_reconciliation(
    reconciliation_id: int,
    payload: ReconciliationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    reconciliation = db.get(MonthlyReconciliation, reconciliation_id)
    if reconciliation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reconciliation not found")

    if payload.actual_balance is not None:
        if user.role not in ("admin", "superadmin"):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Only an Admin can correct a reconciled month's actual balance",
            )
        if not payload.edit_reason:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "A reason is required when editing a reconciled month",
            )

        fy = db.get(FinancialYear, reconciliation.financial_year_id)
        calculated_balance = calculated_balance_for_month(db, fy, reconciliation.month)
        discrepancy = payload.actual_balance - calculated_balance

        reconciliation.calculated_balance = calculated_balance
        reconciliation.actual_balance = payload.actual_balance
        reconciliation.discrepancy = discrepancy
        reconciliation.suggested_reason = suggest_reason(discrepancy)
        reconciliation.edited_by = user.id
        reconciliation.edited_at = datetime.now(timezone.utc)
        reconciliation.edit_reason = payload.edit_reason
        # The Admin has now acknowledged and corrected the figures, so the
        # staleness flag (if any) no longer applies. See docs/decisions-log.md.
        reconciliation.is_stale = False
        reconciliation.stale_reason = None
        reconciliation.stale_since = None

    if payload.discrepancy_notes is not None:
        reconciliation.discrepancy_notes = payload.discrepancy_notes

    db.commit()
    db.refresh(reconciliation)

    audit_service.log_action(
        db, "reconciliation.edited", f"Edited reconciliation for {reconciliation.month.strftime('%B %Y')}",
        user_id=user.id, affected_table="monthly_reconciliations", affected_record_id=reconciliation.id,
    )
    return _to_out(db, reconciliation)


@router.post("/{reconciliation_id}/review", response_model=ReconciliationOut)
def review_reconciliation(
    reconciliation_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Clears a stale flag an Admin has checked and is satisfied is a false
    positive — without re-entering the actual balance, unlike PUT
    /{id} with actual_balance set. For cases where the underlying figures
    genuinely haven't changed (or the change doesn't matter), so there's
    nothing to correct."""
    reconciliation = db.get(MonthlyReconciliation, reconciliation_id)
    if reconciliation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reconciliation not found")
    if not reconciliation.is_stale:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reconciliation is not marked as stale")

    reconciliation.is_stale = False
    reconciliation.stale_reason = None
    reconciliation.stale_since = None
    db.commit()
    db.refresh(reconciliation)

    audit_service.log_action(
        db, "reconciliation.reviewed",
        f"Marked stale reconciliation for {reconciliation.month.strftime('%B %Y')} as reviewed",
        user_id=admin.id, affected_table="monthly_reconciliations", affected_record_id=reconciliation.id,
    )
    return _to_out(db, reconciliation)
