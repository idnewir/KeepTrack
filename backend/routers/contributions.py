"""Contribution endpoints: record, list, edit, and soft-delete monthly contributions."""
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.schemas import (
    ContributionCreate,
    ContributionOut,
    ContributionsMonthlySummaryOut,
    ContributionUpdate,
    PaginatedResponse,
)
from models.user import User
from services import audit_service, financial_year_service as fy_service
from services.date_service import get_effective_start_date
from services.export_pdf_service import generate_table_export_pdf
from services.reconciliation_service import calculated_balance_for_month
from services.settings_service import get_site_name
from utils.csv_export import csv_response
from utils.deps import get_current_user, require_admin, require_standard
from utils.pagination import paginate

router = APIRouter(prefix="/contributions", tags=["contributions"])


def _filtered_contributions_query(db: Session, financial_year_id: int | None, month: int | None):
    query = db.query(Contribution).filter(Contribution.deleted.is_(False))

    if financial_year_id is not None:
        query = query.filter(Contribution.financial_year_id == financial_year_id)
    if month is not None:
        query = query.filter(Contribution.month == month)

    return query.order_by(Contribution.recorded_at.desc(), Contribution.id.desc())


def _month_label_lookup(db: Session, contributions: list[Contribution]) -> dict[tuple[int, int], str]:
    """Maps (financial_year_id, month) -> "September 2025"-style label, for
    every distinct financial year appearing in the given contributions —
    a plain contribution row only carries a month number (1-12), not a
    calendar year, so the year has to be derived from its financial year's
    own month sequence (see services/financial_year_service.month_sequence)."""
    fy_ids = {c.financial_year_id for c in contributions}
    labels: dict[tuple[int, int], str] = {}
    for fy_id in fy_ids:
        fy = db.get(FinancialYear, fy_id)
        if fy is None:
            continue
        for (year, month) in fy_service.month_sequence(fy):
            labels[(fy_id, month)] = f"{fy_service.MONTH_LABELS[month - 1]} {year}"
    return labels


@router.get("", response_model=PaginatedResponse[ContributionOut])
def list_contributions(
    financial_year_id: int | None = None,
    month: int | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = _filtered_contributions_query(db, financial_year_id, month)
    items, pagination = paginate(query, page, per_page)
    return {"data": items, "pagination": pagination}


@router.get("/export/csv")
def export_contributions_csv(
    financial_year_id: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    contributions = _filtered_contributions_query(db, financial_year_id, month).all()
    month_labels = _month_label_lookup(db, contributions)
    users = {u.id: u for u in db.query(User).all()}

    rows = [
        [
            month_labels.get((c.financial_year_id, c.month), str(c.month)),
            c.group_name,
            f"{c.amount:.2f}",
            (users.get(c.recorded_by).display_name or users.get(c.recorded_by).username) if users.get(c.recorded_by) else "",
        ]
        for c in contributions
    ]
    return csv_response(
        "contributions_export.csv",
        ["Month", "Group / Source", "Amount", "Recorded By"],
        rows,
    )


@router.get("/export/pdf")
def export_contributions_pdf(
    financial_year_id: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    contributions = _filtered_contributions_query(db, financial_year_id, month).all()
    month_labels = _month_label_lookup(db, contributions)
    users = {u.id: u for u in db.query(User).all()}

    rows = [
        [
            month_labels.get((c.financial_year_id, c.month), str(c.month)),
            c.group_name,
            f"£{c.amount:,.2f}",
            (users.get(c.recorded_by).display_name or users.get(c.recorded_by).username) if users.get(c.recorded_by) else "",
        ]
        for c in contributions
    ]

    subtitle = None
    if financial_year_id is not None:
        fy = db.get(FinancialYear, financial_year_id)
        if fy is not None:
            subtitle = f"Financial year: {fy.label}"

    pdf_bytes = generate_table_export_pdf(
        title="Contributions Export",
        subtitle=subtitle,
        site_name=get_site_name(db),
        columns=["Month", "Group / Source", "Amount", "Recorded By"],
        rows=rows,
        generated_by_username=user.username,
        generated_at=datetime.now(timezone.utc),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="contributions_export.pdf"'},
    )


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

    audit_service.log_action(
        db, "contribution.created", f"Recorded contribution of £{contribution.amount} from '{contribution.group_name}'",
        user_id=user.id, affected_table="contributions", affected_record_id=contribution.id,
    )
    return contribution


@router.put("/{contribution_id}", response_model=ContributionOut)
def update_contribution(
    contribution_id: int,
    payload: ContributionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    contribution = db.get(Contribution, contribution_id)
    if contribution is None or contribution.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contribution not found")

    changed_fields: dict = {}
    if payload.month is not None and payload.month != contribution.month:
        changed_fields["month"] = {"before": contribution.month, "after": payload.month}
        contribution.month = payload.month
    if payload.group_name is not None and payload.group_name != contribution.group_name:
        changed_fields["group_name"] = {"before": contribution.group_name, "after": payload.group_name}
        contribution.group_name = payload.group_name
    if payload.amount is not None and payload.amount != contribution.amount:
        changed_fields["amount"] = {"before": str(contribution.amount), "after": str(payload.amount)}
        contribution.amount = payload.amount

    db.commit()
    db.refresh(contribution)

    if changed_fields:
        audit_service.log_action(
            db, "contribution.edited", f"Edited contribution from '{contribution.group_name}' ({', '.join(changed_fields)})",
            user_id=user.id, affected_table="contributions", affected_record_id=contribution.id,
            metadata={"changed_fields": changed_fields},
        )
    return contribution


@router.delete("/{contribution_id}", response_model=ContributionOut)
def delete_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    contribution = db.get(Contribution, contribution_id)
    if contribution is None or contribution.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contribution not found")

    contribution.deleted = True
    db.commit()
    db.refresh(contribution)

    audit_service.log_action(
        db, "contribution.deleted", f"Deleted contribution from '{contribution.group_name}'",
        user_id=admin.id, affected_table="contributions", affected_record_id=contribution.id,
    )
    return contribution
