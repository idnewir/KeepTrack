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
