"""Daily background check for category budgets crossing the 80%-used
warning threshold or going over budget for the current month — notifies
every Admin once per category per month per threshold, recorded in
budget_notifications_sent so neither ever repeats. Runs on a lightweight
daemon thread (no APScheduler/Celery in this codebase — see
services/maintenance_service.py), independent of the budget_planning feature
module's enabled state, matching every other background job in this app:
only UI/API access is gated by a module, never the logic behind it. See
docs/decisions-log.md.
"""
import logging
import threading
import time
from datetime import date

from decimal import Decimal

from database import SessionLocal
from models.budget import BudgetNotificationSent, CategoryBudget
from models.category import Category
from services import budget_service, notification_service
from services.financial_year_service import MONTH_LABELS_FULL, get_or_create_financial_year
from services.settings_service import get_notification_preferences, get_notification_thresholds

logger = logging.getLogger("keep_track.budget_notifications")

CHECK_INTERVAL_SECONDS = 24 * 60 * 60


def _already_sent(db, category_id: int, financial_year_id: int, month: int, notification_type: str) -> bool:
    return (
        db.query(BudgetNotificationSent)
        .filter(
            BudgetNotificationSent.category_id == category_id,
            BudgetNotificationSent.financial_year_id == financial_year_id,
            BudgetNotificationSent.month == month,
            BudgetNotificationSent.notification_type == notification_type,
        )
        .first()
        is not None
    )


def _record_sent(db, category_id: int, financial_year_id: int, month: int, notification_type: str) -> None:
    db.add(BudgetNotificationSent(
        category_id=category_id,
        financial_year_id=financial_year_id,
        month=month,
        notification_type=notification_type,
    ))
    db.commit()


def check_budget_thresholds(today: date | None = None) -> int:
    """Notifies every Admin/Superadmin for each category budget whose
    *current month's* spend has crossed 80% or 100% of its budget, once per
    category per month per threshold. Returns the number of notifications
    sent, for the caller to log/inspect."""
    today = today or date.today()
    db = SessionLocal()
    try:
        prefs = get_notification_preferences(db)
        # Independent of budget_service.WARNING_THRESHOLD, which drives the
        # On Track/Warning/Over Budget status badge shown throughout the
        # app (table, cards, monthly detail, dashboard panel, PDF report) —
        # notif_budget_warning_percent only controls when *this background
        # check* raises a notification, deliberately decoupled so changing
        # it doesn't retroactively redefine what "Warning" means on an
        # already-documented, already-tested traffic light elsewhere. See
        # docs/decisions-log.md.
        warning_threshold = Decimal(get_notification_thresholds(db)["notif_budget_warning_percent"])

        fy = get_or_create_financial_year(db, today)
        budgets = db.query(CategoryBudget).filter(CategoryBudget.financial_year_id == fy.id).all()
        categories = {c.id: c for c in db.query(Category).all()}
        month_label = MONTH_LABELS_FULL[today.month - 1]

        sent = 0
        for budget in budgets:
            category = categories.get(budget.category_id)
            if category is None:
                continue

            monthly_budget = budget_service.compute_monthly_budget(budget.annual_amount, budget.monthly_amounts)
            month_key = str(today.month)
            month_budget_amount = monthly_budget[month_key]
            month_actual = budget_service.actual_spend_by_month(db, category.id, fy)[month_key]
            percent_used = (month_actual / month_budget_amount * 100) if month_budget_amount else 0

            if percent_used >= budget_service.OVER_BUDGET_THRESHOLD and not _already_sent(
                db, category.id, fy.id, today.month, "over_budget"
            ):
                # The "already sent" guard is recorded regardless of the
                # on/off preference below, so a category that crossed the
                # threshold while notifications were switched off doesn't
                # flood out a backdated notification the moment they're
                # switched back on.
                if prefs["notif_budget_over"]:
                    over_by = month_actual - month_budget_amount
                    notification_service.notify_admins(
                        db,
                        type=f"budget_over_{category.id}_{fy.id}_{today.month}",
                        title=f"{category.name} is over budget",
                        message=f"{category.name} has exceeded its {month_label} budget by £{over_by:,.2f}.",
                        link="/budget",
                        severity="error",
                    )
                    sent += 1
                _record_sent(db, category.id, fy.id, today.month, "over_budget")
            elif percent_used >= warning_threshold and not _already_sent(
                db, category.id, fy.id, today.month, "warning_80"
            ):
                if prefs["notif_budget_warning"]:
                    notification_service.notify_admins(
                        db,
                        type=f"budget_warning_{category.id}_{fy.id}_{today.month}",
                        title=f"{category.name} budget at {percent_used:.0f}%",
                        message=(
                            f"{category.name} has used {percent_used:.0f}% of its {month_label} budget. "
                            f"£{month_actual:,.2f} of £{month_budget_amount:,.2f} budgeted has been spent."
                        ),
                        link="/budget",
                        severity="warning",
                    )
                    sent += 1
                _record_sent(db, category.id, fy.id, today.month, "warning_80")
        return sent
    finally:
        db.close()


def _check_loop() -> None:
    while True:
        time.sleep(CHECK_INTERVAL_SECONDS)
        try:
            check_budget_thresholds()
        except Exception:
            logger.exception("Budget threshold check failed")


def start_scheduler() -> None:
    """Starts the daily background thread. Does not run the check
    immediately — main.py calls check_budget_thresholds() once at startup
    separately, so the two never race on the same first run (same pattern as
    services/debt_notification_service.py's start_scheduler)."""
    thread = threading.Thread(target=_check_loop, daemon=True)
    thread.start()
