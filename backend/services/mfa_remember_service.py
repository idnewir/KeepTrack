"""MFA remember-token service (backend/models/mfa_remember_token.py).

Remember tokens are tracked in their own table, with independent hash,
expiry, and revoked columns, rather than as a JWT claim — a raw JWT can't be
looked up or revoked individually once issued, but a DB row can. Only the
SHA-256 hash of the raw token is ever stored; the raw value is generated and
returned exactly once, from POST /auth/verify-mfa, and cannot be recovered
from the database. See docs/decisions-log.md.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models.mfa_remember_token import MfaRememberToken
from models.setting import Setting

SESSION_TIMEOUT_MINUTES_KEY = "session_timeout_minutes"
MFA_REMEMBER_HOURS_KEY = "mfa_remember_hours"

# Defaults match the seeded values in migration 0034 — used as the fallback
# when a row is somehow missing/unset, same pattern as
# services/settings_service.py's other setting getters.
SESSION_TIMEOUT_MINUTES_DEFAULT = 120
MFA_REMEMBER_HOURS_DEFAULT = 12


def _setting_int(db: Session, key: str, default: int) -> int:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None or not setting.value:
        return default
    try:
        return int(setting.value)
    except (TypeError, ValueError):
        return default


def get_session_timeout_minutes(db: Session) -> int:
    return _setting_int(db, SESSION_TIMEOUT_MINUTES_KEY, SESSION_TIMEOUT_MINUTES_DEFAULT)


def get_mfa_remember_hours(db: Session) -> int:
    return _setting_int(db, MFA_REMEMBER_HOURS_KEY, MFA_REMEMBER_HOURS_DEFAULT)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _valid_tokens_query(db: Session, user_id: int):
    now = datetime.now(timezone.utc)
    return db.query(MfaRememberToken).filter(
        MfaRememberToken.user_id == user_id,
        MfaRememberToken.revoked.is_(False),
        MfaRememberToken.expires_at > now,
    )


def find_valid_token(db: Session, user_id: int, raw_token: str | None) -> MfaRememberToken | None:
    """Looks up an unrevoked, unexpired token for this user matching the raw
    value a client presented (X-MFA-Remember-Token header). None if the
    header was absent, or the token doesn't match/is expired/revoked —
    callers treat all of those the same way: fall back to normal MFA."""
    if not raw_token:
        return None
    token_hash = hash_token(raw_token)
    return _valid_tokens_query(db, user_id).filter(MfaRememberToken.token_hash == token_hash).first()


def has_active_token(db: Session, user_id: int) -> bool:
    return _valid_tokens_query(db, user_id).first() is not None


def create_token(db: Session, user_id: int) -> tuple[str, datetime]:
    """Generates and stores a new remember token, returning the raw value
    (for the response — the only time it's ever available) and its expiry.
    A fresh token is issued every time MFA is verified with remember
    checked, rather than reusing one across logins. See docs/decisions-log.md."""
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=get_mfa_remember_hours(db))
    entry = MfaRememberToken(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        expires_at=expires_at,
    )
    db.add(entry)
    db.commit()
    return raw_token, expires_at


def revoke_token(db: Session, token: MfaRememberToken) -> None:
    token.revoked = True
    db.commit()


def revoke_all_for_user(db: Session, user_id: int) -> None:
    """Used by DELETE /auth/mfa-remember (Profile page's "Revoke" button) —
    revokes every active token for the user rather than only the one this
    browser happens to hold, so "force full MFA next time" is unambiguous
    even if the user has remembered sessions on more than one device."""
    _valid_tokens_query(db, user_id).update({"revoked": True}, synchronize_session=False)
    db.commit()
