"""Debt Tracking computation: everything derived live from a Debt row rather
than stored (percent paid, months remaining, next payment date, promo
expiry) so it can never drift from the debt's actual current_balance/
interest_rate/rate_type — the same "compute, don't cache" approach already
used by services/project_service.py. See docs/decisions-log.md.
"""
import calendar
import math
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from models.debt import Debt, DebtMilestone, DebtPayment
from models.setting import Setting
from models.user import User
from services import debt_calculator, notification_service
from services.settings_service import get_notification_preferences, get_notification_thresholds

MILESTONE_THRESHOLDS = (25, 50, 75, 100)

DEBT_TERMINOLOGY_DEFAULTS = {
    "debt_term_module": "Debt Tracking",
    "debt_term_debt": "Debt",
    "debt_term_payment": "Payment",
}

SORT_OPTIONS = (
    "interest_rate_desc",
    "interest_rate_asc",
    "balance_desc",
    "balance_asc",
    "payment_due",
    "promo_expiring",
    "recent",
)


def next_payment_date(payment_due_day: int, today: date) -> date:
    """The next occurrence of payment_due_day on or after today. Clamped to
    the last day of a shorter month (e.g. day 31 in February -> the 28th/29th)
    rather than overflowing into the following month."""
    day = min(payment_due_day, calendar.monthrange(today.year, today.month)[1])
    candidate = date(today.year, today.month, day)
    if candidate < today:
        year = today.year + (1 if today.month == 12 else 0)
        month = 1 if today.month == 12 else today.month + 1
        day = min(payment_due_day, calendar.monthrange(year, month)[1])
        candidate = date(year, month, day)
    return candidate


def compute_percent_paid(debt: Debt) -> Decimal:
    """(original_balance - current_balance) / original_balance * 100,
    floored at 0 — a debt whose balance has grown (payment below interest)
    reports 0% paid rather than a confusing negative figure."""
    if not debt.original_balance or debt.original_balance <= 0:
        return Decimal("0")
    percent = (debt.original_balance - debt.current_balance) / debt.original_balance * Decimal("100")
    return percent if percent > 0 else Decimal("0")


def debt_computed_fields(debt: Debt, today: date | None = None, *, promo_warning_days: int) -> dict:
    """Every field GET /debts and GET /debts/{id} report beyond the debt's
    own stored columns. `promo_warning_days` is a plain int, not a `db`
    session, and required rather than defaulted, deliberately — callers
    that compute this once per request (a debt list, the dashboard's debt
    summary) pass the same resolved value to every debt instead of this
    function re-querying the setting once per debt; a caller that only
    ever handles one debt (debt_to_out below) resolves it itself and can
    afford the single query. No fallback default here on purpose: silently
    using the wrong (stale or built-in) number would be worse than a
    TypeError at the one call site that forgot to resolve it."""
    today = today or date.today()

    payoff = debt_calculator.calculate_payoff(debt.current_balance, debt.interest_rate, debt.monthly_payment)

    days_until_promo_ends = None
    promo_expiring_soon = False
    if debt.rate_type in ("promotional", "zero") and debt.promotional_end_date is not None:
        days_until_promo_ends = (debt.promotional_end_date - today).days
        # Same notif_promo_rate_warning_days setting used by
        # services/debt_notification_service.py's background check —
        # this is a single "is this expiring soon" concept shared by the
        # amber card/panel highlight here and the notification there, not
        # two independent thresholds. See docs/decisions-log.md.
        promo_expiring_soon = 0 <= days_until_promo_ends <= promo_warning_days

    return {
        "percent_paid": compute_percent_paid(debt),
        "months_remaining": payoff["months_remaining"],
        "total_interest_remaining": payoff["total_interest"],
        "total_to_pay": payoff["total_to_pay"],
        "payment_below_interest": payoff["warning"],
        "days_until_promo_ends": days_until_promo_ends,
        "promo_expiring_soon": promo_expiring_soon,
        "next_payment_date": next_payment_date(debt.payment_due_day, today),
    }


def _username_map(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    return {uid: uname for uid, uname in db.query(User.id, User.username).filter(User.id.in_(user_ids)).all()}


def payment_to_out(payment: DebtPayment, username_map: dict[int, str]) -> dict:
    return {
        "id": payment.id,
        "debt_id": payment.debt_id,
        "amount": payment.amount,
        "payment_date": payment.payment_date,
        "notes": payment.notes,
        "recorded_by": payment.recorded_by,
        "recorded_by_username": username_map.get(payment.recorded_by),
        "created_at": payment.created_at,
    }


def recent_payments(db: Session, debt_id: int, limit: int = 3) -> list[dict]:
    payments = (
        db.query(DebtPayment)
        .filter(DebtPayment.debt_id == debt_id)
        .order_by(DebtPayment.payment_date.desc(), DebtPayment.id.desc())
        .limit(limit)
        .all()
    )
    username_map = _username_map(db, {p.recorded_by for p in payments})
    return [payment_to_out(p, username_map) for p in payments]


def debt_to_out(
    db: Session, debt: Debt, today: date | None = None, *, promo_warning_days: int | None = None
) -> dict:
    if promo_warning_days is None:
        promo_warning_days = get_notification_thresholds(db)["notif_promo_rate_warning_days"]
    return {
        "id": debt.id,
        "name": debt.name,
        "debt_type": debt.debt_type,
        "custom_type_label": debt.custom_type_label,
        "current_balance": debt.current_balance,
        "original_balance": debt.original_balance,
        "credit_limit": debt.credit_limit,
        "monthly_payment": debt.monthly_payment,
        "payment_due_day": debt.payment_due_day,
        "start_date": debt.start_date,
        "expected_end_date": debt.expected_end_date,
        "interest_rate": debt.interest_rate,
        "rate_type": debt.rate_type,
        "promotional_end_date": debt.promotional_end_date,
        "standard_rate_after_promo": debt.standard_rate_after_promo,
        "notes": debt.notes,
        "is_paid_off": debt.is_paid_off,
        "paid_off_date": debt.paid_off_date,
        "created_by": debt.created_by,
        "created_at": debt.created_at,
        "updated_at": debt.updated_at,
        "active": debt.active,
        **debt_computed_fields(debt, today, promo_warning_days=promo_warning_days),
        "recent_payments": recent_payments(db, debt.id),
    }


def _promo_months_remaining(debt: Debt, today: date) -> int:
    if debt.promotional_end_date is None:
        return 0
    days = (debt.promotional_end_date - today).days
    return max(math.ceil(days / 30), 0)


def debt_to_detail_out(db: Session, debt: Debt, today: date | None = None) -> dict:
    today = today or date.today()
    out = debt_to_out(db, debt, today)

    if debt.rate_type in ("promotional", "zero") and debt.standard_rate_after_promo is not None and debt.promotional_end_date is not None:
        payoff = debt_calculator.calculate_dual_scenario(
            debt.current_balance,
            debt.interest_rate,
            debt.standard_rate_after_promo,
            debt.monthly_payment,
            _promo_months_remaining(debt, today),
        )
    else:
        payoff = debt_calculator.calculate_payoff(debt.current_balance, debt.interest_rate, debt.monthly_payment)

    payments = (
        db.query(DebtPayment)
        .filter(DebtPayment.debt_id == debt.id)
        .order_by(DebtPayment.payment_date.desc(), DebtPayment.id.desc())
        .all()
    )
    username_map = _username_map(db, {p.recorded_by for p in payments})
    out["payments"] = [payment_to_out(p, username_map) for p in payments]
    out["milestones"] = (
        db.query(DebtMilestone)
        .filter(DebtMilestone.debt_id == debt.id)
        .order_by(DebtMilestone.milestone_percent)
        .all()
    )
    out["payoff"] = payoff
    return out


def sort_debts(items: list[dict], sort: str | None) -> list[dict]:
    if sort == "interest_rate_asc":
        return sorted(items, key=lambda d: d["interest_rate"])
    if sort == "balance_desc":
        return sorted(items, key=lambda d: d["current_balance"], reverse=True)
    if sort == "balance_asc":
        return sorted(items, key=lambda d: d["current_balance"])
    if sort == "payment_due":
        return sorted(items, key=lambda d: d["next_payment_date"])
    if sort == "promo_expiring":
        return sorted(
            items,
            key=lambda d: d["days_until_promo_ends"] if d["days_until_promo_ends"] is not None else 10**6,
        )
    if sort == "recent":
        return sorted(items, key=lambda d: d["created_at"], reverse=True)
    # Default and explicit "interest_rate_desc" — highest interest first.
    return sorted(items, key=lambda d: d["interest_rate"], reverse=True)


def check_and_fire_milestones(db: Session, debt: Debt, user_id: int) -> list[int]:
    """Fires a notification (and records a debt_milestones row) for every
    25/50/75/100% threshold now crossed that hasn't already fired for this
    debt — the debt_milestones row's existence is the single guard against
    ever repeating one. Safe to call after every balance change: already-
    fired thresholds are skipped, so calling this on every payment (or on
    mark-paid) is always safe. See docs/decisions-log.md."""
    percent_paid = compute_percent_paid(debt)
    already_fired = {
        m.milestone_percent
        for m in db.query(DebtMilestone).filter(DebtMilestone.debt_id == debt.id).all()
    }
    # The DebtMilestone row (below) is always recorded once a threshold is
    # crossed, regardless of this preference — it's the "once ever" guard
    # against re-firing, and disabling notifications shouldn't cause a
    # flood of backdated ones for milestones already passed once the
    # preference is switched back on. Only the notification itself is
    # gated. See docs/decisions-log.md.
    notify = get_notification_preferences(db)["notif_debt_milestone"]

    newly_fired = []
    for threshold in MILESTONE_THRESHOLDS:
        if percent_paid >= threshold and threshold not in already_fired:
            db.add(DebtMilestone(debt_id=debt.id, milestone_percent=threshold))
            db.commit()
            if notify:
                notification_service.create_notification(
                    db,
                    user_id,
                    type=f"debt_milestone_{debt.id}_{threshold}",
                    title="Debt milestone reached!",
                    message=f"You have paid off {threshold}% of {debt.name}! Keep it up!",
                    severity="info",
                    link=f"/debts/{debt.id}",
                )
            newly_fired.append(threshold)
    return newly_fired


def mark_paid_off(db: Session, debt: Debt, user_id: int, today: date | None = None) -> None:
    """Shared by POST /debts/{id}/mark-paid and the auto-payoff path in
    POST /debts/{id}/payments (balance reaching zero) — zeroes the balance so
    percent_paid reads 100%, then checks every milestone threshold so 25/50/75
    still fire retroactively for a debt that jumps straight to fully paid."""
    today = today or date.today()
    debt.is_paid_off = True
    debt.paid_off_date = today
    debt.current_balance = Decimal("0.00")
    db.commit()
    db.refresh(debt)
    check_and_fire_milestones(db, debt, user_id)


def _setting_value(db: Session, key: str, default: str) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None or not setting.value:
        return default
    return setting.value


def get_debt_terminology(db: Session) -> dict[str, str]:
    return {key: _setting_value(db, key, default) for key, default in DEBT_TERMINOLOGY_DEFAULTS.items()}


def update_debt_terminology(db: Session, updates: dict[str, str], admin_id: int) -> dict[str, str]:
    for key, value in updates.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting is None:
            setting = Setting(key=key)
            db.add(setting)
        setting.value = value
        setting.updated_by = admin_id
        db.commit()
    return get_debt_terminology(db)


def build_dashboard_fields(db: Session, today: date | None = None) -> dict:
    """total_debt/monthly_debt_payments/debts_with_promo_expiring/
    highest_interest_debt/net_worth/debts_summary for GET /dashboard/summary,
    computed only when the debt_tracking module is enabled (see
    routers/dashboard.py)."""
    # Imported locally to avoid a circular import — financial_year_service
    # doesn't import this module, but keeping the import local here matches
    # the existing precedent in services/project_service.py's
    # funding_progress for the same reason.
    from services import financial_year_service as fy_service

    today = today or date.today()
    debts = db.query(Debt).filter(Debt.active.is_(True), Debt.is_paid_off.is_(False)).all()
    promo_warning_days = get_notification_thresholds(db)["notif_promo_rate_warning_days"]

    total_debt = sum((d.current_balance for d in debts), Decimal("0"))
    monthly_debt_payments = sum((d.monthly_payment for d in debts), Decimal("0"))

    debts_with_promo_expiring = []
    highest_interest_debt = None
    debts_summary = []
    for d in debts:
        fields = debt_computed_fields(d, today, promo_warning_days=promo_warning_days)
        if fields["promo_expiring_soon"]:
            debts_with_promo_expiring.append({
                "id": d.id,
                "name": d.name,
                "days_until_promo_ends": fields["days_until_promo_ends"],
                "promotional_end_date": d.promotional_end_date,
                "standard_rate_after_promo": d.standard_rate_after_promo,
            })
        if highest_interest_debt is None or d.interest_rate > highest_interest_debt.interest_rate:
            highest_interest_debt = d
        debts_summary.append({
            "id": d.id,
            "name": d.name,
            "current_balance": d.current_balance,
            "interest_rate": d.interest_rate,
            "next_payment_date": fields["next_payment_date"],
            "promotional_end_date": d.promotional_end_date,
        })

    current_balance = fy_service.current_money_on_hand(db, today)

    return {
        "total_debt": total_debt,
        "monthly_debt_payments": monthly_debt_payments,
        "debts_with_promo_expiring": debts_with_promo_expiring,
        "highest_interest_debt": (
            {"id": highest_interest_debt.id, "name": highest_interest_debt.name, "interest_rate": highest_interest_debt.interest_rate}
            if highest_interest_debt is not None
            else None
        ),
        "net_worth": current_balance - total_debt,
        "debts_summary": debts_summary,
    }
