"""Report data aggregation.

Pulls confirmed invoices, contributions, and planned projects for a report's
date range and category scope, and computes every figure the PDF and the AI
summary need: monthly/annual totals, category breakdowns, a year-on-year
comparison, a monthly average, and a forecast for any months in the range
that haven't happened yet.

Kept separate from financial_year_service (which answers "where does the
CURRENT financial year stand, right now") because a report's scope is an
arbitrary user-chosen date range and category list, not "this financial
year" — but a handful of primitives (MONTH_LABELS, fy_bounds_for,
recent-months forecasting) are reused from there so a report's forecast
can't quietly disagree with the dashboard's about what "forecast" means.
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from models.category import Category
from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.invoice import Invoice
from models.planned_project import PlannedProject
from services import project_service
from services.financial_year_service import (
    MONTH_LABELS,
    MONTH_LABELS_FULL,
    category_monthly_averages,
    fy_bounds_for,
    month_sequence,
    recent_actual_months,
)


def resolve_categories(db: Session, category_ids: list[int]) -> list[Category]:
    """Categories the report is scoped to — every active category if none were chosen."""
    query = db.query(Category)
    if category_ids:
        query = query.filter(Category.id.in_(category_ids))
    else:
        query = query.filter(Category.active.is_(True))
    return query.order_by(Category.name).all()


def _confirmed_invoices(db: Session, date_from: date, date_to: date, category_ids: list[int]) -> list[Invoice]:
    query = db.query(Invoice).filter(
        Invoice.reviewed.is_(True),
        Invoice.deleted.is_(False),
        Invoice.invoice_date >= date_from,
        Invoice.invoice_date <= date_to,
    )
    if category_ids:
        query = query.filter(Invoice.category_id.in_(category_ids))
    return query.order_by(Invoice.invoice_date).all()


def _contributions_in_range(db: Session, date_from: date, date_to: date) -> list[tuple[Contribution, date]]:
    """Contributions whose (financial_year, month-number) falls within the range.

    Contributions have no date column of their own (see database-schema.md) —
    only a financial_year_id and a 1-12 month number — so each is dated by
    resolving its month against that financial year's own month sequence
    (the same mapping financial_year_service uses for the dashboard).
    """
    results: list[tuple[Contribution, date]] = []
    financial_years = (
        db.query(FinancialYear)
        .filter(FinancialYear.start_date <= date_to, FinancialYear.end_date >= date_from)
        .all()
    )
    for fy in financial_years:
        month_to_calendar = {m: (y, m) for (y, m) in month_sequence(fy)}
        contributions = (
            db.query(Contribution)
            .filter(Contribution.financial_year_id == fy.id, Contribution.deleted.is_(False))
            .all()
        )
        for c in contributions:
            calendar = month_to_calendar.get(c.month)
            if calendar is None:
                continue
            c_date = date(calendar[0], calendar[1], 1)
            if date_from <= c_date <= date_to:
                results.append((c, c_date))
    return results


def _projects_in_range(db: Session, date_from: date, date_to: date) -> list[PlannedProject]:
    return (
        db.query(PlannedProject)
        .filter(
            PlannedProject.active.is_(True),
            PlannedProject.expected_month >= date_from,
            PlannedProject.expected_month <= date_to,
        )
        .order_by(PlannedProject.expected_month)
        .all()
    )


def _month_span(date_from: date, date_to: date) -> list[tuple[int, int]]:
    months = []
    y, m = date_from.year, date_from.month
    while (y, m) <= (date_to.year, date_to.month):
        months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def _monthly_totals(
    invoices: list[Invoice],
    contributions: list[tuple[Contribution, date]],
    months: list[tuple[int, int]],
) -> list[dict]:
    spend_by_month: dict[tuple[int, int], Decimal] = {}
    for inv in invoices:
        key = (inv.invoice_date.year, inv.invoice_date.month)
        spend_by_month[key] = spend_by_month.get(key, Decimal("0")) + inv.amount

    income_by_month: dict[tuple[int, int], Decimal] = {}
    for c, c_date in contributions:
        key = (c_date.year, c_date.month)
        income_by_month[key] = income_by_month.get(key, Decimal("0")) + c.amount

    return [
        {
            "year": y,
            "month": m,
            "month_label": f"{MONTH_LABELS[m - 1]} {y}",
            "spend": spend_by_month.get((y, m), Decimal("0")),
            "income": income_by_month.get((y, m), Decimal("0")),
        }
        for (y, m) in months
    ]


def _category_breakdown(invoices: list[Invoice], categories: list[Category], include_uncategorised: bool) -> list[dict]:
    totals: dict[int | None, Decimal] = {}
    for inv in invoices:
        totals[inv.category_id] = totals.get(inv.category_id, Decimal("0")) + inv.amount
    grand_total = sum(totals.values(), Decimal("0"))

    breakdown = [
        {
            "category_id": cat.id,
            "category_name": cat.name,
            "category_colour": cat.colour,
            "total": totals.get(cat.id, Decimal("0")),
            "percent_of_total": (totals.get(cat.id, Decimal("0")) / grand_total * 100) if grand_total else Decimal("0"),
        }
        for cat in categories
    ]

    uncategorised = totals.get(None, Decimal("0"))
    if include_uncategorised and uncategorised:
        breakdown.append({
            "category_id": None,
            "category_name": "Uncategorised",
            "category_colour": None,
            "total": uncategorised,
            "percent_of_total": (uncategorised / grand_total * 100) if grand_total else Decimal("0"),
        })

    return breakdown


def _financial_year_windows(db: Session, years_included: int, end_date: date) -> list[tuple[date, date, str]]:
    """The last `years_included` financial years, oldest first, ending with the FY containing end_date."""
    end_start, _end_end, _end_label = fy_bounds_for(db, end_date)
    windows = [fy_bounds_for(db, date(end_start.year - i, end_start.month, 1)) for i in range(years_included)]
    windows.reverse()
    return windows


def _annual_totals(
    db: Session, categories: list[Category], category_ids: list[int], windows: list[tuple[date, date, str]]
) -> list[dict]:
    rows = []
    previous_total: Decimal | None = None
    for (start, end, label) in windows:
        query = db.query(Invoice).filter(
            Invoice.reviewed.is_(True),
            Invoice.deleted.is_(False),
            Invoice.invoice_date >= start,
            Invoice.invoice_date <= end,
        )
        if category_ids:
            query = query.filter(Invoice.category_id.in_(category_ids))

        totals: dict[int | None, Decimal] = {}
        for inv in query.all():
            totals[inv.category_id] = totals.get(inv.category_id, Decimal("0")) + inv.amount

        by_category = {cat.id: totals.get(cat.id, Decimal("0")) for cat in categories}
        total = sum(by_category.values(), Decimal("0"))
        yoy_change_percent = None
        if previous_total:
            yoy_change_percent = (total - previous_total) / previous_total * 100

        rows.append({
            "label": label,
            "start_date": start,
            "end_date": end,
            "by_category": by_category,
            "total": total,
            "yoy_change_percent": yoy_change_percent,
        })
        previous_total = total
    return rows


def _planned_cost_for_month(db: Session, year: int, month: int) -> Decimal:
    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])
    projects = (
        db.query(PlannedProject)
        .filter(
            PlannedProject.active.is_(True),
            PlannedProject.expected_month >= month_start,
            PlannedProject.expected_month <= month_end,
        )
        .all()
    )
    return sum((p.estimated_cost for p in projects), Decimal("0"))


def _forecast(db: Session, categories: list[Category], category_ids: list[int], date_to: date, today: date) -> dict:
    """Forecast for any month in the report's range that is today's month or later."""
    current_key = (today.year, today.month)
    if date_to < date(today.year, today.month, 1):
        return {"months": [], "by_category": []}

    span_start = max(date(today.year, today.month, 1), date(today.year, today.month, 1))
    months = [(y, m) for (y, m) in _month_span(span_start, date_to) if (y, m) >= current_key]
    if not months:
        return {"months": [], "by_category": []}

    recent_months = recent_actual_months(today, 3)
    averages = category_monthly_averages(db, recent_months)  # {category_id_or_None: monthly average}
    selected_ids = {cat.id for cat in categories}
    include_uncategorised = not category_ids

    base_monthly = sum((amt for cid, amt in averages.items() if cid in selected_ids), Decimal("0"))
    if include_uncategorised:
        base_monthly += averages.get(None, Decimal("0"))

    month_rows = []
    for (y, m) in months:
        planned_cost = _planned_cost_for_month(db, y, m)
        month_rows.append({
            "year": y,
            "month": m,
            "month_label": f"{MONTH_LABELS[m - 1]} {y}",
            "forecast_spend": base_monthly + planned_cost,
            "planned_project_cost": planned_cost,
        })

    by_category = [
        {
            "category_id": cat.id,
            "category_name": cat.name,
            "category_colour": cat.colour,
            "monthly_average": averages.get(cat.id, Decimal("0")),
            "remaining_months": len(months),
            "forecast_total": averages.get(cat.id, Decimal("0")) * len(months),
        }
        for cat in categories
    ]
    uncategorised_avg = averages.get(None, Decimal("0"))
    if include_uncategorised and uncategorised_avg:
        by_category.append({
            "category_id": None,
            "category_name": "Uncategorised",
            "category_colour": None,
            "monthly_average": uncategorised_avg,
            "remaining_months": len(months),
            "forecast_total": uncategorised_avg * len(months),
        })

    return {"months": month_rows, "by_category": by_category}


def _funding_position(
    db: Session, date_from: date, invoices: list[Invoice], contributions: list[tuple[Contribution, date]]
) -> dict | None:
    """Opening balance (from the financial year containing the start of the range,
    if one is set) plus contributions and spend actually falling in the report's range."""
    fy = (
        db.query(FinancialYear)
        .filter(FinancialYear.start_date <= date_from, FinancialYear.end_date >= date_from)
        .first()
    )
    total_income = sum((c.amount for c, _ in contributions), Decimal("0"))
    total_spend = sum((inv.amount for inv in invoices), Decimal("0"))

    if fy is None and not contributions:
        return None

    opening_balance = fy.opening_balance if fy else None
    return {
        "financial_year_label": fy.label if fy else None,
        "opening_balance": opening_balance,
        "total_contributions": total_income,
        "total_spend": total_spend,
        "net_position": (opening_balance or Decimal("0")) + total_income - total_spend,
    }


def build_report_data(
    db: Session,
    date_from: date,
    date_to: date,
    category_ids: list[int],
    years_included: int,
    report_type: str,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    categories = resolve_categories(db, category_ids)
    include_uncategorised = not category_ids

    invoices = _confirmed_invoices(db, date_from, date_to, category_ids)
    contributions = _contributions_in_range(db, date_from, date_to)
    projects = _projects_in_range(db, date_from, date_to)

    months = _month_span(date_from, date_to)
    monthly_totals = _monthly_totals(invoices, contributions, months)

    current_key = (today.year, today.month)
    elapsed_rows = [row for row in monthly_totals if (row["year"], row["month"]) <= current_key]
    total_spend = sum((row["spend"] for row in monthly_totals), Decimal("0"))
    total_income = sum((row["income"] for row in monthly_totals), Decimal("0"))
    monthly_average_spend = (
        sum((row["spend"] for row in elapsed_rows), Decimal("0")) / Decimal(len(elapsed_rows))
        if elapsed_rows
        else Decimal("0")
    )

    category_breakdown = _category_breakdown(invoices, categories, include_uncategorised)

    fy_windows = _financial_year_windows(db, years_included, date_to)
    annual_totals = _annual_totals(db, categories, category_ids, fy_windows)

    forecast = {"months": [], "by_category": []}
    if report_type in ("forecast", "combined"):
        forecast = _forecast(db, categories, category_ids, date_to, today)

    funding_position = _funding_position(db, date_from, invoices, contributions)

    # Enriches the same in-range project set used for the AI context's
    # "planned projects due" list (below) with actual-vs-estimated figures,
    # for the report's new project summary table. Reuses
    # services/project_service.py rather than recomputing actual spend here,
    # so a report's numbers can't disagree with the Projects page's.
    planned_projects = []
    total_estimated = Decimal("0")
    total_actual = Decimal("0")
    for p in projects:
        actual_cost, invoice_count = project_service.actual_cost_and_invoice_count(db, p.id)
        variance = p.estimated_cost - actual_cost
        total_estimated += p.estimated_cost
        total_actual += actual_cost
        planned_projects.append({
            "id": p.id,
            "name": p.name,
            "estimated_cost": p.estimated_cost,
            "expected_month": p.expected_month,
            "expected_month_label": f"{MONTH_LABELS_FULL[p.expected_month.month - 1]} {p.expected_month.year}",
            "actual_cost": actual_cost,
            "invoice_count": invoice_count,
            "variance": variance,
            "variance_percent": (variance / p.estimated_cost * 100) if p.estimated_cost else Decimal("0"),
            "project_status": project_service.compute_status(p, actual_cost),
        })

    return {
        "date_from": date_from,
        "date_to": date_to,
        "report_type": report_type,
        "years_included": years_included,
        "categories": [{"id": c.id, "name": c.name, "colour": c.colour} for c in categories],
        "invoice_count": len(invoices),
        "total_spend": total_spend,
        "total_income": total_income,
        "net_position": total_income - total_spend,
        "monthly_average_spend": monthly_average_spend,
        "monthly_totals": monthly_totals,
        "category_breakdown": category_breakdown,
        "annual_totals": annual_totals,
        "forecast": forecast,
        "planned_projects": planned_projects,
        "project_summary_totals": {
            "total_estimated": total_estimated,
            "total_actual": total_actual,
            "total_variance": total_estimated - total_actual,
        },
        "funding_position": funding_position,
    }
