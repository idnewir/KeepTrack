"""Monthly reconciliation calculations.

`calculated_balance_for_month` implements docs/features.md#4's formula
("money on hand = opening balance + contributions to date − invoices to
date"), evaluated up to and including a given calendar month rather than
"as of today" — so a reconciliation for a past month reflects the ledger as
it stood at the end of that month, not the current running balance.
"""
from calendar import monthrange
from decimal import Decimal
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.invoice import Invoice
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
