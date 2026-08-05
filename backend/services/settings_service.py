"""Helpers for reading site-wide settings (backend/models/setting.py)."""
from sqlalchemy.orm import Session

from config import settings as app_config
from models.setting import Setting

FINANCIAL_YEAR_START_MONTH_KEY = "financial_year_start_month"


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
