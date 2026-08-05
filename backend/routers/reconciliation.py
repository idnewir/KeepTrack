"""Monthly reconciliation endpoints: compare the calculated balance against the actual bank balance."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.financial_year import FinancialYear
from models.monthly_reconciliation import MonthlyReconciliation
from models.schemas import ReconciliationCreate, ReconciliationOut, ReconciliationMonthOut, ReconciliationUpdate
from models.user import User
from services import financial_year_service as fy_service
from services.date_service import get_effective_start_date
from services.reconciliation_service import calculated_balance_for_month, suggest_reason
from utils.deps import get_current_user, require_standard

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])


def _to_out(db: Session, row: MonthlyReconciliation) -> dict:
    reconciler = db.get(User, row.reconciled_by)
    editor = db.get(User, row.edited_by) if row.edited_by is not None else None
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
    }


@router.get("", response_model=list[ReconciliationOut])
def list_reconciliations(
    financial_year_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(MonthlyReconciliation).filter(
        MonthlyReconciliation.month >= get_effective_start_date(db)
    )
    if financial_year_id is not None:
        query = query.filter(MonthlyReconciliation.financial_year_id == financial_year_id)

    rows = query.order_by(MonthlyReconciliation.month).all()
    return [_to_out(db, row) for row in rows]


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

    if payload.discrepancy_notes is not None:
        reconciliation.discrepancy_notes = payload.discrepancy_notes

    db.commit()
    db.refresh(reconciliation)
    return _to_out(db, reconciliation)
