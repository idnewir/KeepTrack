"""The app_start_date setting: which months should be hidden across the app.

`app_start_date` (backend/models/setting.py) is NULL until an Admin sets it
(via the setup wizard or Settings) — when unset, every month back to the
start of the current financial year is shown, exactly as before this
feature existed.

Deliberately does not import services/financial_year_service.py: that module
will need get_effective_start_date() for its own monthly breakdown (see
build_summary), and importing it back here would create a circular import.
The financial-year-start fallback is small enough to keep independent.
"""
from datetime import date

from sqlalchemy.orm import Session

from config import settings as app_config
from models.setting import Setting

APP_START_DATE_KEY = "app_start_date"


def _current_financial_year_start(today: date) -> date:
    start_month = app_config.default_financial_year_start_month
    start_year = today.year if today.month >= start_month else today.year - 1
    return date(start_year, start_month, 1)


def get_app_start_date(db: Session) -> date | None:
    setting = db.query(Setting).filter(Setting.key == APP_START_DATE_KEY).first()
    if setting is None or not setting.value:
        return None
    return date.fromisoformat(setting.value)


def get_effective_start_date(db: Session, today: date | None = None) -> date:
    """The earliest month that should be visible anywhere in the app."""
    app_start_date = get_app_start_date(db)
    if app_start_date is not None:
        return app_start_date
    return _current_financial_year_start(today or date.today())
