"""Contribution endpoints: record, list, edit, and soft-delete monthly contributions."""
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.schemas import (
    ContributionCreate,
    ContributionOut,
    ContributionsMonthlySummaryOut,
    ContributionUpdate,
)
from models.user import User
from services import financial_year_service as fy_service
from services.date_service import get_effective_start_date
from services.reconciliation_service import calculated_balance_for_month
from utils.deps import get_current_user, require_admin, require_standard

router = APIRouter(prefix="/contributions", tags=["contributions"])


@router.get("", response_model=list[ContributionOut])
def list_contributions(
    financial_year_id: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(Contribution).filter(Contribution.deleted.is_(False))

    if financial_year_id is not None:
        query = query.filter(Contribution.financial_year_id == financial_year_id)
    if month is not None:
        query = query.filter(Contribution.month == month)

    return query.order_by(Contribution.month, Contribution.group_name).all()


@router.get("/monthly-summary", response_model=ContributionsMonthlySummaryOut)
def monthly_summary(
    financial_year_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    fy = (
        db.get(FinancialYear, financial_year_id)
        if financial_year_id is not None
        else fy_service.get_or_create_financial_year(db)
    )
    if fy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial year not found")

    contributions = (
        db.query(Contribution)
        .filter(Contribution.financial_year_id == fy.id, Contribution.deleted.is_(False))
        .all()
    )

    groups = sorted({c.group_name for c in contributions})

    by_month: dict[int, dict[str, Decimal]] = {}
    for c in contributions:
        by_month.setdefault(c.month, {})
        by_month[c.month][c.group_name] = by_month[c.month].get(c.group_name, Decimal("0")) + c.amount

    effective_start = get_effective_start_date(db)
    effective_start_key = (effective_start.year, effective_start.month)

    rows = []
    for (year, month) in fy_service.month_sequence(fy):
        if (year, month) < effective_start_key:
            continue
        month_contributions = by_month.get(month, {})
        breakdown = {group: month_contributions.get(group, Decimal("0")) for group in groups}
        total = sum(breakdown.values(), Decimal("0"))
        running_balance = calculated_balance_for_month(db, fy, date(year, month, 1))

        rows.append({
            "year": year,
            "month": month,
            "month_label": f"{fy_service.MONTH_LABELS[month - 1]} {year}",
            "breakdown": breakdown,
            "total": total,
            "running_balance": running_balance,
        })

    return {
        "financial_year_id": fy.id,
        "opening_balance": fy.opening_balance,
        "groups": groups,
        "rows": rows,
    }


@router.post("", response_model=ContributionOut, status_code=status.HTTP_201_CREATED)
def create_contribution(
    payload: ContributionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    fy = db.get(FinancialYear, payload.financial_year_id)
    if fy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial year not found")

    contribution = Contribution(
        financial_year_id=payload.financial_year_id,
        month=payload.month,
        group_name=payload.group_name,
        amount=payload.amount,
        recorded_by=user.id,
    )
    db.add(contribution)
    db.commit()
    db.refresh(contribution)
    return contribution


@router.put("/{contribution_id}", response_model=ContributionOut)
def update_contribution(
    contribution_id: int,
    payload: ContributionUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    contribution = db.get(Contribution, contribution_id)
    if contribution is None or contribution.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contribution not found")

    if payload.month is not None:
        contribution.month = payload.month
    if payload.group_name is not None:
        contribution.group_name = payload.group_name
    if payload.amount is not None:
        contribution.amount = payload.amount

    db.commit()
    db.refresh(contribution)
    return contribution


@router.delete("/{contribution_id}", response_model=ContributionOut)
def delete_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    contribution = db.get(Contribution, contribution_id)
    if contribution is None or contribution.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contribution not found")

    contribution.deleted = True
    db.commit()
    db.refresh(contribution)
    return contribution
