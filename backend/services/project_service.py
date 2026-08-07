"""Planned project financial computation.

actual_cost, variance, and project_status are all derived live from linked
confirmed invoices rather than stored on planned_projects — the same choice
already made for actual_cost in the task brief, extended to status since it
depends on the same live figure. A stored status column would drift the
moment an invoice was added, edited, or unlinked; recomputing it here (the
same "compute, don't cache" approach the dashboard's own notifications and
reconciliation staleness already use) means it can never disagree with the
underlying invoices. See docs/decisions-log.md.

Only confirmed (reviewed, non-deleted) invoices count toward actual spend —
the same "confirmed invoice" definition used everywhere else actual spend is
totalled (dashboard summary, reports, reconciliation).
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.category import Category
from models.invoice import Invoice
from models.planned_project import PlannedProject

PROJECT_STATUSES = ("planning", "in_progress", "completed", "over_budget")


def _add_months(d: date, months: int) -> date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    return date(year, month, 1)


def funding_progress(db: Session, project: PlannedProject, today: date | None = None) -> dict | None:
    """Progress toward a "saving toward this project" funding target —
    None unless is_funding_target is set and both funding_target_amount and
    funding_target_date are present.

    monthly_surplus_needed and current_monthly_surplus are both measured
    against the app's overall current balance and its recent income/spend
    trend (services/financial_year_service), not this project's own
    estimated/actual cost — a funding target project is a savings goal
    ("save £3,000 by June"), a different question from "has actual spend
    stayed under the estimate", which is what actual_cost/variance above
    already answer. See docs/decisions-log.md.
    """
    if not project.is_funding_target or project.funding_target_amount is None or project.funding_target_date is None:
        return None

    # Imported locally to avoid a circular import — financial_year_service
    # already imports this module for planned_project_cost_for_month.
    from services import financial_year_service as fy_service

    today = today or date.today()
    current_balance = fy_service.current_money_on_hand(db, today)
    remaining_needed = project.funding_target_amount - current_balance

    months_remaining = (
        (project.funding_target_date.year - today.year) * 12
        + (project.funding_target_date.month - today.month)
    )
    overdue = project.funding_target_date < today or months_remaining <= 0

    if overdue:
        monthly_surplus_needed = remaining_needed if remaining_needed > 0 else Decimal("0")
    else:
        monthly_surplus_needed = (remaining_needed / months_remaining) if remaining_needed > 0 else Decimal("0")

    current_monthly_surplus = fy_service.average_monthly_income(db, today) - fy_service.average_monthly_spend(db, today)

    if remaining_needed <= 0:
        on_track = True
        projected_completion = today
    elif overdue:
        on_track = False
        projected_completion = None
    else:
        on_track = current_monthly_surplus >= monthly_surplus_needed
        if current_monthly_surplus > 0:
            months_to_complete = -(-remaining_needed // current_monthly_surplus)  # ceiling division
            projected_completion = _add_months(today, int(months_to_complete))
        else:
            # No surplus at the current trajectory — the goal is never
            # reached at this rate, so there's nothing meaningful to project.
            projected_completion = None

    return {
        "current_balance": current_balance,
        "monthly_surplus_needed": monthly_surplus_needed,
        "current_monthly_surplus": current_monthly_surplus,
        "on_track": on_track,
        "projected_completion": projected_completion,
    }


def _confirmed_invoices_query(db: Session, project_id: int):
    return db.query(Invoice).filter(
        Invoice.project_id == project_id,
        Invoice.reviewed.is_(True),
        Invoice.deleted.is_(False),
    )


def actual_cost_and_invoice_count(db: Session, project_id: int) -> tuple[Decimal, int]:
    total, count = (
        _confirmed_invoices_query(db, project_id)
        .with_entities(func.coalesce(func.sum(Invoice.amount), 0), func.count(Invoice.id))
        .one()
    )
    return Decimal(total), count


def compute_status(project: PlannedProject, actual_cost: Decimal) -> str:
    # Completion wins over budget status — once a project is marked done,
    # that's the headline state regardless of how it landed financially;
    # over_budget is a warning flag for spend still in flight, not a verdict
    # on finished work. See docs/decisions-log.md.
    if project.completed:
        return "completed"
    if actual_cost > project.estimated_cost:
        return "over_budget"
    if actual_cost > 0:
        return "in_progress"
    return "planning"


def remaining_estimated_cost(project: PlannedProject, actual_cost: Decimal) -> Decimal:
    """What's left of the estimate for forecasting purposes: the full
    estimate for a project with no confirmed spend yet, or the unspent
    remainder (floored at zero) once some has landed — see
    financial_year_service.planned_project_cost_for_month."""
    if actual_cost <= 0:
        return project.estimated_cost
    remaining = project.estimated_cost - actual_cost
    return remaining if remaining > 0 else Decimal("0")


def project_financials(db: Session, project: PlannedProject) -> dict:
    """actual_cost, variance, status, and the full linked-invoice list for a
    single project — used by the Projects list/detail endpoints."""
    actual_cost, invoice_count = actual_cost_and_invoice_count(db, project.id)
    variance = project.estimated_cost - actual_cost
    variance_percent = (variance / project.estimated_cost * 100) if project.estimated_cost else Decimal("0")

    invoices = _confirmed_invoices_query(db, project.id).order_by(Invoice.invoice_date.desc()).all()
    categories = {c.id: c for c in db.query(Category).all()}
    linked_invoices = [
        {
            "id": inv.id,
            "invoice_date": inv.invoice_date,
            "supplier": inv.supplier,
            "amount": inv.amount,
            "category_id": inv.category_id,
            "category_name": categories[inv.category_id].name if inv.category_id in categories else None,
            "category_colour": categories[inv.category_id].colour if inv.category_id in categories else None,
        }
        for inv in invoices
    ]

    return {
        "actual_cost": actual_cost,
        "invoice_count": invoice_count,
        "variance": variance,
        "variance_percent": variance_percent,
        "project_status": compute_status(project, actual_cost),
        "linked_invoices": linked_invoices,
    }
