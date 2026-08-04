"""Helpers for reading site-wide settings (backend/models/setting.py)."""
from sqlalchemy.orm import Session

from models.setting import Setting


def is_signing_enabled(db: Session) -> bool:
    setting = db.query(Setting).filter(Setting.key == "signing_enabled").first()
    # No row (shouldn't happen post-migration) defaults to enabled rather
    # than silently skipping an audit-trail step someone may be relying on.
    return setting is None or setting.value.lower() == "true"
