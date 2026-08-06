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
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.category import Category
from models.invoice import Invoice
from models.planned_project import PlannedProject

PROJECT_STATUSES = ("planning", "in_progress", "completed", "over_budget")


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
