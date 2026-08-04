"""Helpers for reading site-wide settings (backend/models/setting.py)."""
from sqlalchemy.orm import Session

from models.setting import Setting


def is_signing_enabled(db: Session) -> bool:
    setting = db.query(Setting).filter(Setting.key == "signing_enabled").first()
    # No row (shouldn't happen post-migration) defaults to enabled rather
    # than silently skipping an audit-trail step someone may be relying on.
    return setting is None or setting.value.lower() == "true"


def get_site_name(db: Session) -> str:
    """The organisation/site name shown on report covers and given to the AI as
    context. Seeded to "Keep Track" (migration 0014) and editable like any other
    setting via PUT /settings/site_name — no report-specific endpoint needed."""
    setting = db.query(Setting).filter(Setting.key == "site_name").first()
    return setting.value if setting is not None else "Keep Track"
