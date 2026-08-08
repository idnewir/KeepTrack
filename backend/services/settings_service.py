"""Helpers for reading site-wide settings (backend/models/setting.py)."""
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from config import settings as app_config
from models.setting import Setting

FINANCIAL_YEAR_START_MONTH_KEY = "financial_year_start_month"

# Defaults match the seeded values in migration 0019 — used as the fallback
# when a row is somehow missing/unset, same pattern as is_signing_enabled.
# site_name is a General setting (see get_site_name below), not a term_*
# label, so it's kept out of this dict.
TERMINOLOGY_DEFAULTS = {
    "term_expenses": "Invoices",
    "term_income": "Contributions",
    "term_projects": "Projects",
    "term_reconciliation": "Reconciliation",
    "term_reserve": "Target Reserve",
}

RESERVE_CALCULATION_DEFAULT = "automatic"
RESERVE_MONTHS_DEFAULT = 3

# Whether each notification type is generated at all — checked by every
# call site listed in the docstrings of routers/dashboard.py,
# services/budget_notification_service.py, and
# services/debt_notification_service.py before it creates or updates a
# notification of that type. Keyed by the same notif_* setting name used to
# store it, so a caller can go straight from "which preference gates this"
# to the dict key without a second mapping. See docs/decisions-log.md.
NOTIF_PREFERENCE_DEFAULTS = {
    "notif_balance_warning": True,
    "notif_unsigned_invoice": True,
    "notif_stale_reconciliation": True,
    "notif_reconciliation_overdue": True,
    "notif_critical_error": True,
    "notif_project_overdue": True,
    "notif_promo_rate_expiring": True,
    "notif_budget_warning": True,
    "notif_budget_over": True,
    "notif_debt_milestone": True,
}

# How many days (or, for budget, what percent) must pass/be used before the
# underlying *condition* is considered true in the first place — distinct
# from NOTIF_PREFERENCE_DEFAULTS above, which controls whether a
# notification is raised once the condition already is true. Defaults match
# migration 0045's seeded values.
NOTIF_THRESHOLD_DEFAULTS = {
    "notif_reconciliation_overdue_days": 30,
    "notif_promo_rate_warning_days": 30,
    "notif_unconfirmed_invoice_days": 3,
    "notif_budget_warning_percent": 80,
}


def _setting_value(db: Session, key: str, default: str | None = None) -> str | None:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None or setting.value is None:
        return default
    return setting.value


def is_signing_enabled(db: Session) -> bool:
    setting = db.query(Setting).filter(Setting.key == "signing_enabled").first()
    # No row (shouldn't happen post-migration) defaults to enabled rather
    # than silently skipping an audit-trail step someone may be relying on.
    return setting is None or setting.value.lower() == "true"


def get_financial_year_start_month(db: Session) -> int:
    """The configured month (1-12) the financial year starts in. Defaults to
    config.py's default_financial_year_start_month (September) if the
    settings row is missing or unset — same fallback pattern as
    is_signing_enabled above."""
    setting = db.query(Setting).filter(Setting.key == FINANCIAL_YEAR_START_MONTH_KEY).first()
    if setting is None or not setting.value:
        return app_config.default_financial_year_start_month
    return int(setting.value)


def get_site_name(db: Session) -> str:
    """The organisation/site name shown on report covers and given to the AI as
    context. Seeded to "Keep Track" (migration 0014) and editable like any other
    setting via PUT /settings/site_name — no report-specific endpoint needed."""
    setting = db.query(Setting).filter(Setting.key == "site_name").first()
    return setting.value if setting is not None else "Keep Track"


def get_terminology(db: Session) -> dict[str, str]:
    """The current value of every term_* label, defaulting per-key when a
    row is missing or cleared. Powers GET /settings/terminology (any
    logged-in user — the frontend needs these to render navigation and page
    titles) and is also used server-side wherever a generated string (e.g. a
    dashboard notification) needs to speak the organisation's own vocabulary
    rather than the KHOC-derived defaults. site_name lives under General
    settings, not here — see get_site_name below."""
    return {key: _setting_value(db, key, default) for key, default in TERMINOLOGY_DEFAULTS.items()}


def get_reserve_settings(db: Session) -> dict:
    """The current target reserve configuration: 'automatic' (a rolling
    monthly average times reserve_months) or 'manual' (a fixed
    reserve_manual_amount). Falls back to the automatic default if the
    stored calculation method is somehow neither."""
    calculation = _setting_value(db, "reserve_calculation", RESERVE_CALCULATION_DEFAULT)
    if calculation not in ("automatic", "manual"):
        calculation = RESERVE_CALCULATION_DEFAULT

    months_raw = _setting_value(db, "reserve_months", str(RESERVE_MONTHS_DEFAULT))
    try:
        months = int(months_raw)
    except (TypeError, ValueError):
        months = RESERVE_MONTHS_DEFAULT

    manual_raw = _setting_value(db, "reserve_manual_amount", None)
    manual_amount = None
    if manual_raw:
        try:
            manual_amount = Decimal(manual_raw)
        except InvalidOperation:
            manual_amount = None

    return {"calculation": calculation, "months": months, "manual_amount": manual_amount}


def get_notification_preferences(db: Session) -> dict[str, bool]:
    """Every notif_* on/off preference, defaulting to on when a row is
    missing or holds something other than the literal string 'false' —
    matches is_signing_enabled's own "missing row means on" fallback above,
    since a missing preference row should never silently go quiet."""
    return {
        key: _setting_value(db, key, "true").lower() != "false"
        for key in NOTIF_PREFERENCE_DEFAULTS
    }


def get_notification_thresholds(db: Session) -> dict[str, int]:
    """Every notif_*_days/percent threshold, parsed to int and falling back
    to its migration-seeded default if the row is missing or unparseable."""
    result = {}
    for key, default in NOTIF_THRESHOLD_DEFAULTS.items():
        raw = _setting_value(db, key, str(default))
        try:
            result[key] = int(raw)
        except (TypeError, ValueError):
            result[key] = default
    return result
