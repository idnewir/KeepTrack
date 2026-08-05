"""Financial year rules shared by the dashboard (and, later, reports/reconciliation).

- The financial year runs 12 months from the configured
  `financial_year_start_month` setting (Settings page / setup wizard;
  September by default — see services/settings_service.py), determined from
  today's date. Changing the setting does not rewrite existing
  `financial_years` rows: a new start month produces a new FY label, so the
  next lookup lazily creates a fresh row alongside the old one rather than
  altering history. See docs/decisions-log.md.
- The target reserve is configurable (Settings page): "automatic" multiplies
  a 3-month rolling average of total monthly spend by a configurable number
  of months (reserve_months, default 3 — the original hardcoded behaviour),
  or "manual" uses a fixed £ amount. The forecast for remaining months reuses
  the same recent-months per-category averages regardless of the reserve
  setting. See docs/decisions-log.md for the reasoning.
"""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from models.category import Category
from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.invoice import Invoice
from models.planned_project import PlannedProject
from services.date_service import get_effective_start_date
from services.settings_service import get_financial_year_start_month, get_reserve_settings, get_terminology

MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def fy_bounds_for(db: Session, for_date: date) -> tuple[date, date, str]:
    """Start/end dates and label (e.g. "FY2025/26 (Apr-Mar)") of the FY containing for_date."""
    start_month = get_financial_year_start_month(db)
    start_year = for_date.year if for_date.month >= start_month else for_date.year - 1

    # The FY always spans exactly 12 months, so the end month is always the
    # one immediately before the start month (wrapping December -> January).
    # A January start month is the one case where that doesn't cross into a
    # second calendar year (Jan-Dec of the same year); every other start
    # month does (e.g. Sep 2025 - Aug 2026).
    if start_month == 1:
        end_year = start_year
        end_month = 12
    else:
        end_year = start_year + 1
        end_month = start_month - 1
    end_day = monthrange(end_year, end_month)[1]

    start = date(start_year, start_month, 1)
    end = date(end_year, end_month, end_day)
    if end_year == start_year:
        label = f"FY{start_year} ({MONTH_LABELS[start_month - 1]}–{MONTH_LABELS[end_month - 1]})"
    else:
        label = f"FY{start_year}/{str(end_year)[-2:]} ({MONTH_LABELS[start_month - 1]}–{MONTH_LABELS[end_month - 1]})"
    return start, end, label


def get_current_financial_year(db: Session, for_date: date | None = None) -> FinancialYear:
    return get_or_create_financial_year(db, for_date)


def get_or_create_financial_year(db: Session, for_date: date | None = None) -> FinancialYear:
    start, end, label = fy_bounds_for(db, for_date or date.today())

    fy = db.query(FinancialYear).filter(FinancialYear.label == label).first()
    if fy is not None:
        return fy

    # Financial year rollover (Settings, per docs/features.md#8-settings)
    # isn't built yet, so there's nowhere else a row for the current FY would
    # come from. Creating it lazily here is what lets the dashboard, and
    # anything with a financial_year_id FK, work before that page exists.
    fy = FinancialYear(label=label, start_date=start, end_date=end)
    db.add(fy)
    db.commit()
    db.refresh(fy)
    return fy


def month_sequence(fy: FinancialYear) -> list[tuple[int, int]]:
    """Ordered (calendar_year, calendar_month) pairs spanning the financial year."""
    months = []
    y, m = fy.start_date.year, fy.start_date.month
    for _ in range(12):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def recent_actual_months(today: date, count: int = 3) -> list[tuple[int, int]]:
    """The `count` calendar months immediately before today's month."""
    months = []
    y, m = today.year, today.month
    for _ in range(count):
        m -= 1
        if m < 1:
            m = 12
            y -= 1
        months.append((y, m))
    return months


def _confirmed_invoices_in_months(db: Session, months: list[tuple[int, int]]) -> list[Invoice]:
    start_y, start_m = min(months)
    end_y, end_m = max(months)
    range_start = date(start_y, start_m, 1)
    range_end = date(end_y, end_m, monthrange(end_y, end_m)[1])

    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.reviewed.is_(True),
            Invoice.deleted.is_(False),
            Invoice.invoice_date >= range_start,
            Invoice.invoice_date <= range_end,
        )
        .all()
    )
    month_set = set(months)
    return [inv for inv in invoices if (inv.invoice_date.year, inv.invoice_date.month) in month_set]


def recent_totals_by_category(db: Session, months: list[tuple[int, int]]) -> dict[int | None, Decimal]:
    """Sum of confirmed invoice amounts per category across the given months."""
    totals: dict[int | None, Decimal] = {}
    for inv in _confirmed_invoices_in_months(db, months):
        totals[inv.category_id] = totals.get(inv.category_id, Decimal("0")) + inv.amount
    return totals


def category_monthly_averages(db: Session, months: list[tuple[int, int]]) -> dict[int | None, Decimal]:
    """Average monthly spend per category over the given months, for all active categories."""
    totals = recent_totals_by_category(db, months)
    divisor = Decimal(max(len(months), 1))

    averages = {cat.id: totals.get(cat.id, Decimal("0")) / divisor for cat in db.query(Category).filter(Category.active.is_(True))}
    # Uncategorised spend still counts toward the forecast total.
    if None in totals:
        averages[None] = totals[None] / divisor
    return averages


def average_monthly_spend(db: Session, today: date | None = None, months: int = 3) -> Decimal:
    """Rolling average total monthly spend over the most recent `months` calendar months."""
    recent_months = recent_actual_months(today or date.today(), months)
    totals = recent_totals_by_category(db, recent_months)
    return sum(totals.values(), Decimal("0")) / Decimal(months)


def target_reserve(db: Session, today: date | None = None) -> tuple[Decimal, dict]:
    """The configured target reserve amount, plus the reserve settings used to
    compute it (so callers — the dashboard summary — can also report the
    calculation method and months multiplier without a second settings read).

    "automatic": a fixed 3-month rolling average of total monthly spend
    (matching the app's existing forecasting window), multiplied by the
    configurable reserve_months (1-12, default 3 — reproduces the original
    hardcoded 3-month-average behaviour when left at its default).
    "manual": a fixed £ amount (reserve_manual_amount).
    See docs/decisions-log.md.
    """
    reserve_settings = get_reserve_settings(db)
    if reserve_settings["calculation"] == "manual":
        amount = reserve_settings["manual_amount"] or Decimal("0")
    else:
        amount = average_monthly_spend(db, today, months=3) * Decimal(reserve_settings["months"])
    return amount, reserve_settings


def planned_project_cost_for_month(db: Session, fy: FinancialYear, year: int, month: int) -> Decimal:
    """Sum of active planned project costs expected in this calendar month.

    Includes projects tied to this FY (financial_year_id == fy.id) and
    projects not yet tied to any FY (financial_year_id is NULL).
    """
    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])

    projects = (
        db.query(PlannedProject)
        .filter(
            PlannedProject.active.is_(True),
            PlannedProject.expected_month >= month_start,
            PlannedProject.expected_month <= month_end,
        )
        .filter((PlannedProject.financial_year_id == fy.id) | (PlannedProject.financial_year_id.is_(None)))
        .all()
    )
    return sum((p.estimated_cost for p in projects), Decimal("0"))


def active_planned_projects(db: Session, fy: FinancialYear) -> list[PlannedProject]:
    return (
        db.query(PlannedProject)
        .filter(PlannedProject.active.is_(True))
        .filter((PlannedProject.financial_year_id == fy.id) | (PlannedProject.financial_year_id.is_(None)))
        .order_by(PlannedProject.expected_month)
        .all()
    )


def build_summary(db: Session, today: date | None = None) -> dict:
    """Assemble the full /dashboard/summary payload. Also reused by /dashboard/notifications
    so both endpoints agree on balance_status without recomputing the rules twice."""
    today = today or date.today()
    fy = get_or_create_financial_year(db, today)
    months = month_sequence(fy)

    all_fy_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.reviewed.is_(True),
            Invoice.deleted.is_(False),
            Invoice.invoice_date >= fy.start_date,
            Invoice.invoice_date <= fy.end_date,
        )
        .all()
    )
    total_invoices_confirmed = len(all_fy_invoices)
    total_spent = sum((inv.amount for inv in all_fy_invoices), Decimal("0"))

    contributions = db.query(Contribution).filter(Contribution.financial_year_id == fy.id).all()
    total_contributions = sum((c.amount for c in contributions), Decimal("0"))

    current_balance = total_contributions - total_spent
    reserve, reserve_settings = target_reserve(db, today)

    if reserve <= 0:
        balance_status = "above" if current_balance >= 0 else "below"
    else:
        ratio = current_balance / reserve
        if ratio >= 1:
            balance_status = "above"
        elif ratio >= Decimal("0.9"):
            balance_status = "near"
        else:
            balance_status = "below"

    invoice_month_totals: dict[tuple[int, int], Decimal] = {}
    for inv in all_fy_invoices:
        key = (inv.invoice_date.year, inv.invoice_date.month)
        invoice_month_totals[key] = invoice_month_totals.get(key, Decimal("0")) + inv.amount

    contribution_month_totals: dict[int, Decimal] = {}
    for c in contributions:
        contribution_month_totals[c.month] = contribution_month_totals.get(c.month, Decimal("0")) + c.amount

    recent_months = recent_actual_months(today, 3)
    category_averages = category_monthly_averages(db, recent_months)
    monthly_forecast_base = sum(category_averages.values(), Decimal("0"))

    current_month_key = (today.year, today.month)
    # Months before app_start_date (or, if unset, before the FY start — a
    # no-op) are dropped entirely from the chart rather than shown as empty
    # rows. See docs/decisions-log.md.
    effective_start = get_effective_start_date(db, today)
    effective_start_key = (effective_start.year, effective_start.month)

    breakdown = []
    elapsed_months = 0
    visible_elapsed_spend = Decimal("0")
    for (y, m) in months:
        if (y, m) < effective_start_key:
            continue

        is_elapsed = (y, m) <= current_month_key
        actual_spend = invoice_month_totals.get((y, m), Decimal("0"))
        actual_income = contribution_month_totals.get(m, Decimal("0"))
        planned_cost = planned_project_cost_for_month(db, fy, y, m)

        if is_elapsed:
            elapsed_months += 1
            visible_elapsed_spend += actual_spend
            forecast_spend = actual_spend
        else:
            forecast_spend = monthly_forecast_base + planned_cost

        breakdown.append({
            "year": y,
            "month": m,
            "month_label": f"{MONTH_LABELS[m - 1]} {y}",
            "actual_spend": actual_spend,
            "actual_income": actual_income,
            "forecast_spend": forecast_spend,
            "planned_project_cost": planned_cost,
            "is_elapsed": is_elapsed,
        })

    # Matches the visible breakdown above (elapsed months from app_start_date
    # onwards), not the whole financial year, so it reads as "average since
    # you started tracking" rather than being diluted by hidden months.
    monthly_average_cost = (
        (visible_elapsed_spend / Decimal(elapsed_months)) if elapsed_months else Decimal("0")
    )

    projects = active_planned_projects(db, fy)
    planned_projects = [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "estimated_cost": p.estimated_cost,
            "expected_month": p.expected_month,
            "expected_month_label": f"{MONTH_LABELS[p.expected_month.month - 1]} {p.expected_month.year}",
        }
        for p in projects
    ]

    upcoming_expected_invoices = _build_upcoming_expected_invoices(db, today)
    recent_activity = _build_recent_activity(db)

    categories = db.query(Category).filter(Category.active.is_(True)).order_by(Category.name).all()
    remaining_months_count = sum(1 for row in breakdown if not row["is_elapsed"])
    forecast_by_category = [
        {
            "category_id": cat.id,
            "category_name": cat.name,
            "category_colour": cat.colour,
            "monthly_average": category_averages.get(cat.id, Decimal("0")),
            "remaining_months": remaining_months_count,
            "remaining_months_total": category_averages.get(cat.id, Decimal("0")) * remaining_months_count,
        }
        for cat in categories
    ]
    uncategorised_avg = category_averages.get(None, Decimal("0"))
    if uncategorised_avg:
        forecast_by_category.append({
            "category_id": None,
            "category_name": "Uncategorised",
            "category_colour": None,
            "monthly_average": uncategorised_avg,
            "remaining_months": remaining_months_count,
            "remaining_months_total": uncategorised_avg * remaining_months_count,
        })

    return {
        "financial_year": {
            "id": fy.id,
            "label": fy.label,
            "start_date": fy.start_date,
            "end_date": fy.end_date,
            "opening_balance": fy.opening_balance,
        },
        "total_invoices_confirmed": total_invoices_confirmed,
        "total_spent": total_spent,
        "total_contributions": total_contributions,
        "current_balance": current_balance,
        "target_reserve": reserve,
        "reserve_label": get_terminology(db)["term_reserve"],
        "reserve_calculation": reserve_settings["calculation"],
        "reserve_months": reserve_settings["months"] if reserve_settings["calculation"] == "automatic" else None,
        "balance_status": balance_status,
        "monthly_average_cost": monthly_average_cost,
        "monthly_breakdown": breakdown,
        "planned_projects": planned_projects,
        "upcoming_expected_invoices": upcoming_expected_invoices,
        "recent_activity": recent_activity,
        "forecast_by_category": forecast_by_category,
    }


def _build_upcoming_expected_invoices(db: Session, today: date) -> list[dict]:
    """Suppliers who've billed at least twice in the last 3 months, so a repeat looks likely soon."""
    months = recent_actual_months(today, 3)
    invoices = _confirmed_invoices_in_months(db, months)

    by_supplier: dict[str, list[Invoice]] = {}
    for inv in invoices:
        by_supplier.setdefault(inv.supplier, []).append(inv)

    categories = {c.id: c for c in db.query(Category).all()}

    results = []
    for supplier, supplier_invoices in by_supplier.items():
        if len(supplier_invoices) < 2:
            continue
        last_invoice = max(supplier_invoices, key=lambda inv: inv.invoice_date)
        avg_amount = sum((inv.amount for inv in supplier_invoices), Decimal("0")) / Decimal(len(supplier_invoices))
        category = categories.get(last_invoice.category_id)
        # Suppliers billing monthly are assumed due again ~1 month after their
        # last invoice — a fixed 30-day step avoids adding a calendar-math
        # dependency for a deliberately approximate estimate.
        expected_around = last_invoice.invoice_date + timedelta(days=30)

        results.append({
            "supplier": supplier,
            "category_id": category.id if category else None,
            "category_name": category.name if category else None,
            "category_colour": category.colour if category else None,
            "estimated_amount": avg_amount,
            "expected_around": expected_around,
        })

    results.sort(key=lambda r: r["expected_around"])
    return results


def _build_recent_activity(db: Session, limit: int = 5) -> list[dict]:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.reviewed.is_(True), Invoice.deleted.is_(False))
        .order_by(Invoice.invoice_date.desc(), Invoice.id.desc())
        .limit(limit)
        .all()
    )
    categories = {c.id: c for c in db.query(Category).all()}

    results = []
    for inv in invoices:
        category = categories.get(inv.category_id)
        results.append({
            "id": inv.id,
            "invoice_date": inv.invoice_date,
            "supplier": inv.supplier,
            "amount": inv.amount,
            "category_id": category.id if category else None,
            "category_name": category.name if category else None,
            "category_colour": category.colour if category else None,
        })
    return results
