"""Budget Planning computation: monthly budget figures, actual spend, and
variance are all computed live from CategoryBudget's stored annual_amount/
monthly_amounts and confirmed invoices — never stored themselves, so they
can never drift from the underlying invoice data. The same "compute, don't
cache" approach already used by services/project_service.py and
services/debt_service.py. See docs/decisions-log.md.
"""
from decimal import ROUND_HALF_UP, Decimal
from datetime import date

from sqlalchemy.orm import Session

from models.budget import CategoryBudget, SavingsGoal
from models.category import Category
from models.financial_year import FinancialYear
from models.invoice import Invoice
from models.setting import Setting
from services import financial_year_service as fy_service

WARNING_THRESHOLD = Decimal("80")
OVER_BUDGET_THRESHOLD = Decimal("100")

BUDGET_TERMINOLOGY_DEFAULTS = {
    "budget_term_module": "Budget Planning",
    "budget_term_budget": "Budget",
    "budget_term_savings_goal": "Savings Goal",
}


def _money(amount) -> Decimal:
    return Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def resolve_financial_year(db: Session, financial_year_id: int | None, today: date | None = None) -> FinancialYear:
    today = today or date.today()
    if financial_year_id is not None:
        fy = db.get(FinancialYear, financial_year_id)
        if fy is None:
            raise ValueError(f"Financial year {financial_year_id} not found")
        return fy
    return fy_service.get_or_create_financial_year(db, today)


def compute_monthly_budget(annual_amount: Decimal, monthly_amounts: dict | None) -> dict[str, Decimal]:
    """Every calendar month 1-12 -> its budget: the override in
    monthly_amounts if one is set for that month, else annual_amount / 12.
    Keyed by plain month number as a string ("1".."12") — unambiguous within
    a single financial year since each calendar month appears in it exactly
    once, regardless of which month the year starts in."""
    overrides = monthly_amounts or {}
    fallback = _money(Decimal(annual_amount) / Decimal(12))
    return {
        str(m): _money(overrides[str(m)]) if str(m) in overrides and overrides[str(m)] is not None else fallback
        for m in range(1, 13)
    }


def _elapsed_month_numbers(fy: FinancialYear, today: date) -> list[int]:
    """Calendar month numbers (1-12) in this financial year that have
    started on or before today — "year to date" within the FY. A financial
    year that hasn't started yet contributes none; one that has fully
    finished contributes all twelve."""
    current_key = (today.year, today.month)
    return [m for (y, m) in fy_service.month_sequence(fy) if (y, m) <= current_key]


def actual_spend_by_month(db: Session, category_id: int, fy: FinancialYear) -> dict[str, Decimal]:
    """Confirmed invoice totals per calendar month for one category, across
    the given financial year."""
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.reviewed.is_(True),
            Invoice.deleted.is_(False),
            Invoice.category_id == category_id,
            Invoice.invoice_date >= fy.start_date,
            Invoice.invoice_date <= fy.end_date,
        )
        .all()
    )
    totals: dict[str, Decimal] = {str(m): Decimal("0") for m in range(1, 13)}
    for inv in invoices:
        key = str(inv.invoice_date.month)
        totals[key] = totals[key] + inv.amount
    return {k: _money(v) for k, v in totals.items()}


def budget_status(percent_used: Decimal) -> str:
    if percent_used >= OVER_BUDGET_THRESHOLD:
        return "over_budget"
    if percent_used >= WARNING_THRESHOLD:
        return "warning"
    return "under_budget"


def budget_to_out(db: Session, budget: CategoryBudget, fy: FinancialYear, category: Category, today: date | None = None) -> dict:
    today = today or date.today()
    monthly_budget = compute_monthly_budget(budget.annual_amount, budget.monthly_amounts)
    actual_by_month = actual_spend_by_month(db, category.id, fy)
    variance_by_month = {m: monthly_budget[m] - actual_by_month[m] for m in monthly_budget}

    elapsed = [str(m) for m in _elapsed_month_numbers(fy, today)]
    ytd_budget = _money(sum((monthly_budget[m] for m in elapsed), Decimal("0")))
    ytd_actual = _money(sum((actual_by_month[m] for m in elapsed), Decimal("0")))
    ytd_variance = _money(ytd_budget - ytd_actual)
    percent_used = (ytd_actual / ytd_budget * 100) if ytd_budget else Decimal("0")

    return {
        "id": budget.id,
        "category_id": category.id,
        "category_name": category.name,
        "category_colour": category.colour,
        "financial_year_id": fy.id,
        "annual_amount": budget.annual_amount,
        "monthly_amounts": budget.monthly_amounts,
        "monthly_budget": monthly_budget,
        "actual_spend_by_month": actual_by_month,
        "variance_by_month": variance_by_month,
        "ytd_budget": ytd_budget,
        "ytd_actual": ytd_actual,
        "ytd_variance": ytd_variance,
        "status": budget_status(percent_used),
        "percent_used": percent_used,
        "created_by": budget.created_by,
        "created_at": budget.created_at,
        "updated_at": budget.updated_at,
    }


def list_budgets_for_fy(db: Session, fy: FinancialYear, today: date | None = None) -> list[dict]:
    budgets = db.query(CategoryBudget).filter(CategoryBudget.financial_year_id == fy.id).all()
    categories = {c.id: c for c in db.query(Category).all()}
    out = []
    for b in budgets:
        category = categories.get(b.category_id)
        if category is None:
            continue
        out.append(budget_to_out(db, b, fy, category, today))
    out.sort(key=lambda b: b["category_name"])
    return out


def unbudgeted_categories(db: Session, fy: FinancialYear, budgeted_category_ids: set[int], today: date | None = None) -> list[dict]:
    today = today or date.today()
    elapsed = [str(m) for m in _elapsed_month_numbers(fy, today)]
    categories = db.query(Category).filter(Category.active.is_(True), ~Category.id.in_(budgeted_category_ids or [0])).all()

    out = []
    for cat in categories:
        actual_by_month = actual_spend_by_month(db, cat.id, fy)
        spend_ytd = _money(sum((actual_by_month[m] for m in elapsed), Decimal("0")))
        if spend_ytd <= 0:
            continue
        out.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "category_colour": cat.colour,
            "actual_spend_ytd": spend_ytd,
        })
    out.sort(key=lambda c: c["category_name"])
    return out


def budgets_list_out(db: Session, financial_year_id: int | None, today: date | None = None) -> dict:
    today = today or date.today()
    fy = resolve_financial_year(db, financial_year_id, today)
    budgets = list_budgets_for_fy(db, fy, today)
    budgeted_ids = {b["category_id"] for b in budgets}
    return {
        "financial_year_id": fy.id,
        "financial_year_label": fy.label,
        "budgets": budgets,
        "unbudgeted_categories": unbudgeted_categories(db, fy, budgeted_ids, today),
    }


def budgets_summary(db: Session, financial_year_id: int | None, today: date | None = None) -> dict:
    today = today or date.today()
    fy = resolve_financial_year(db, financial_year_id, today)
    budgets = list_budgets_for_fy(db, fy, today)

    total_budgeted = _money(sum((b["ytd_budget"] for b in budgets), Decimal("0")))
    total_actual = _money(sum((b["ytd_actual"] for b in budgets), Decimal("0")))
    total_variance = _money(total_budgeted - total_actual)

    def _summary_item(b: dict) -> dict:
        return {
            "category_id": b["category_id"],
            "category_name": b["category_name"],
            "category_colour": b["category_colour"],
            "ytd_budget": b["ytd_budget"],
            "ytd_actual": b["ytd_actual"],
            "percent_used": b["percent_used"],
        }

    over_budget = [_summary_item(b) for b in budgets if b["status"] == "over_budget"]
    warning = [_summary_item(b) for b in budgets if b["status"] == "warning"]

    if over_budget:
        overall_status = "over_budget"
    elif warning:
        overall_status = "warning"
    else:
        overall_status = "on_track"

    return {
        "financial_year_id": fy.id,
        "total_budgeted_ytd": total_budgeted,
        "total_actual_ytd": total_actual,
        "total_variance_ytd": total_variance,
        "categories_over_budget": over_budget,
        "categories_warning": warning,
        "overall_status": overall_status,
    }


# ---------------------------------------------------------------------------
# Savings goals
# ---------------------------------------------------------------------------

def _months_remaining(today: date, target_date: date) -> int:
    """Whole calendar months from today to target_date, floored at 1 so a
    goal due this month (or overdue) still gives a usable divisor for
    monthly_needed rather than a division by zero."""
    months = (target_date.year - today.year) * 12 + (target_date.month - today.month)
    return max(months, 1)


def savings_goal_to_out(db: Session, goal: SavingsGoal, today: date | None = None) -> dict:
    today = today or date.today()
    category = db.get(Category, goal.category_id) if goal.category_id else None

    percent_complete = (goal.current_amount / goal.target_amount * 100) if goal.target_amount else Decimal("0")
    months_remaining = _months_remaining(today, goal.target_date)
    remaining_amount = goal.target_amount - goal.current_amount
    monthly_needed = _money(remaining_amount / Decimal(months_remaining)) if remaining_amount > 0 else Decimal("0.00")

    # On track: what should have been saved by now, on a straight-line path
    # from creation to the target date, compared against what's actually
    # been saved — using created_at as the start of that line since there's
    # no separate "start date" column on the goal.
    total_months = max(_months_remaining(goal.created_at.date(), goal.target_date), 1)
    elapsed_months = total_months - months_remaining
    expected_by_now = _money(goal.target_amount * Decimal(elapsed_months) / Decimal(total_months)) if elapsed_months > 0 else Decimal("0.00")
    on_track = goal.status != "active" or goal.current_amount >= expected_by_now

    return {
        "id": goal.id,
        "name": goal.name,
        "description": goal.description,
        "target_amount": goal.target_amount,
        "target_date": goal.target_date,
        "current_amount": goal.current_amount,
        "category_id": goal.category_id,
        "category_name": category.name if category else None,
        "financial_year_id": goal.financial_year_id,
        "status": goal.status,
        "created_by": goal.created_by,
        "created_at": goal.created_at,
        "updated_at": goal.updated_at,
        "percent_complete": percent_complete if percent_complete <= 100 else Decimal("100"),
        "months_remaining": months_remaining,
        "monthly_needed": monthly_needed,
        "on_track": on_track,
    }


def dashboard_savings_goals(db: Session, today: date | None = None, limit: int | None = None) -> list[dict]:
    query = db.query(SavingsGoal).filter(SavingsGoal.status == "active").order_by(SavingsGoal.target_date)
    if limit:
        query = query.limit(limit)
    return [savings_goal_to_out(db, g, today) for g in query.all()]


def list_savings_goals(db: Session, today: date | None = None) -> list[dict]:
    """Active and completed goals — everything except cancelled (soft
    deleted). Distinct from dashboard_savings_goals above, which is
    active-only: the dashboard panel only ever shows goals still in
    progress, but the Budget page's Savings Goals tab also needs completed
    ones for its "Completed goals" section. See docs/decisions-log.md."""
    goals = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.status != "cancelled")
        .order_by(SavingsGoal.target_date)
        .all()
    )
    return [savings_goal_to_out(db, g, today) for g in goals]


# ---------------------------------------------------------------------------
# Terminology
# ---------------------------------------------------------------------------

def _setting_value(db: Session, key: str, default: str) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None or not setting.value:
        return default
    return setting.value


def get_budget_terminology(db: Session) -> dict[str, str]:
    return {key: _setting_value(db, key, default) for key, default in BUDGET_TERMINOLOGY_DEFAULTS.items()}


def update_budget_terminology(db: Session, updates: dict[str, str], admin_id: int) -> dict[str, str]:
    for key, value in updates.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting is None:
            setting = Setting(key=key)
            db.add(setting)
        setting.value = value
        setting.updated_by = admin_id
        db.commit()
    return get_budget_terminology(db)


# ---------------------------------------------------------------------------
# Dashboard integration
# ---------------------------------------------------------------------------

def build_dashboard_fields(db: Session, today: date | None = None) -> dict:
    """budget_summary/savings_goals for GET /dashboard/summary, computed only
    when the budget_planning module is enabled (see routers/dashboard.py)."""
    today = today or date.today()
    summary = budgets_summary(db, None, today)
    return {
        "budget_summary": {
            "total_budgeted_ytd": summary["total_budgeted_ytd"],
            "total_actual_ytd": summary["total_actual_ytd"],
            "total_variance_ytd": summary["total_variance_ytd"],
            "categories_over_budget": summary["categories_over_budget"],
            "categories_warning": summary["categories_warning"],
            "overall_status": summary["overall_status"],
        },
        "savings_goals": [
            {
                "id": g["id"],
                "name": g["name"],
                "target_amount": g["target_amount"],
                "target_date": g["target_date"],
                "current_amount": g["current_amount"],
                "percent_complete": g["percent_complete"],
                "months_remaining": g["months_remaining"],
                "monthly_needed": g["monthly_needed"],
                "on_track": g["on_track"],
            }
            for g in dashboard_savings_goals(db, today)
        ],
    }
