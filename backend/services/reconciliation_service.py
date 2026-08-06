"""Monthly reconciliation calculations.

`calculated_balance_for_month` implements docs/features.md#4's formula
("money on hand = opening balance + contributions to date − invoices to
date"), evaluated up to and including a given calendar month rather than
"as of today" — so a reconciliation for a past month reflects the ledger as
it stood at the end of that month, not the current running balance.
"""
from calendar import monthrange
from decimal import Decimal
from datetime import date, datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.invoice import Invoice
from models.monthly_reconciliation import MonthlyReconciliation
from services.financial_year_service import month_sequence

# A round-number threshold separating a "small" discrepancy (bank
# interest/charges, a rounding slip) from a "large" one (a genuinely missing
# invoice or contribution) worth chasing down. Not user-configurable yet —
# see docs/decisions-log.md.
SMALL_DISCREPANCY_THRESHOLD = Decimal("20.00")


def calculated_balance_for_month(db: Session, fy: FinancialYear, month_date: date) -> Decimal:
    """Opening balance + contributions to date − confirmed invoices to date,
    evaluated as of the end of month_date's calendar month."""
    opening = fy.opening_balance or Decimal("0")

    months_to_date = [
        (y, m) for (y, m) in month_sequence(fy) if (y, m) <= (month_date.year, month_date.month)
    ]
    month_numbers = {m for (_, m) in months_to_date}

    contributions_to_date = db.query(func.coalesce(func.sum(Contribution.amount), 0)).filter(
        Contribution.financial_year_id == fy.id,
        Contribution.deleted.is_(False),
        Contribution.month.in_(month_numbers),
    ).scalar() or Decimal("0")

    month_end = date(month_date.year, month_date.month, monthrange(month_date.year, month_date.month)[1])
    invoices_to_date = db.query(func.coalesce(func.sum(Invoice.amount), 0)).filter(
        Invoice.reviewed.is_(True),
        Invoice.deleted.is_(False),
        Invoice.invoice_date >= fy.start_date,
        Invoice.invoice_date <= month_end,
    ).scalar() or Decimal("0")

    return opening + Decimal(contributions_to_date) - Decimal(invoices_to_date)


def suggest_reason(discrepancy: Decimal) -> str:
    if discrepancy == 0:
        return "Fully reconciled — the actual balance matches the calculated balance exactly."

    abs_discrepancy = abs(discrepancy)
    if abs_discrepancy <= SMALL_DISCREPANCY_THRESHOLD:
        if discrepancy > 0:
            return "Small positive discrepancy — possible bank interest or unrecorded income."
        return "Small negative discrepancy — possible bank charge or unrecorded invoice."

    return "Large discrepancy — likely a missing invoice or contribution. Worth checking closely."


def calendar_month_date(fy: FinancialYear, month_number: int) -> date:
    """First-of-month date for a bare 1-12 month number within fy's own month
    sequence. Contributions only store a month number, not a calendar year,
    so the year has to be derived from which financial year it belongs to."""
    for (year, month) in month_sequence(fy):
        if month == month_number:
            return date(year, month, 1)
    raise ValueError(f"Month {month_number} is not part of financial year {fy.id}")


def mark_reconciliation_stale(db: Session, month: date, financial_year_id: int, reason: str) -> None:
    """Flags the reconciliation for this month (if one exists and isn't
    already stale) as out of date, because a contribution or invoice that
    feeds its calculated balance changed after it was submitted. No-ops if
    nothing has been reconciled for that month yet — there's nothing to flag."""
    month_start = date(month.year, month.month, 1)
    reconciliation = (
        db.query(MonthlyReconciliation)
        .filter(
            MonthlyReconciliation.financial_year_id == financial_year_id,
            MonthlyReconciliation.month == month_start,
        )
        .first()
    )
    if reconciliation is None or reconciliation.is_stale:
        return

    reconciliation.is_stale = True
    reconciliation.stale_reason = reason
    reconciliation.stale_since = datetime.now(timezone.utc)
    db.commit()
