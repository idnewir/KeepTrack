"""Shared FastAPI dependencies for authentication and role checks."""
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models.setting import Setting
from models.user import User
from utils.security import SCOPE_ACCESS, TokenError, decode_token

_bearer_scheme = HTTPBearer(auto_error=False)

JWT_INVALIDATE_BEFORE_KEY = "jwt_invalidate_before"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    try:
        payload = decode_token(credentials.credentials, expected_scope=SCOPE_ACCESS)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    # POST /storage/restore stamps this setting with "now" to force every
    # existing token to stop working, since JWTs are otherwise stateless and
    # have no per-user revocation list — see docs/decisions-log.md.
    invalidate_setting = db.query(Setting).filter(Setting.key == JWT_INVALIDATE_BEFORE_KEY).first()
    if invalidate_setting is not None and invalidate_setting.value:
        # Floor to whole seconds on both sides before comparing: a JWT's
        # `iat` only has whole-second resolution (python-jose drops the
        # fractional part when encoding), but this setting is stored with
        # microsecond precision — comparing them unfloored means a login
        # that happens in the very same second as the restore (a near
        # certainty for the Superadmin logging back in right after) has an
        # `iat` that floors to *before* the precise invalidation instant,
        # and gets wrongly rejected. Confirmed directly: the first restore
        # test locked the Superadmin out of a system they'd just
        # successfully restored. See docs/decisions-log.md.
        invalidate_before = datetime.fromisoformat(invalidate_setting.value).replace(microsecond=0)
        issued_at = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        if issued_at < invalidate_before:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session invalidated — please log in again.")

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    if not user.approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account pending approval")
    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account has been deactivated. Please contact an Administrator.",
        )

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return user


def require_standard(user: User = Depends(get_current_user)) -> User:
    """Any authenticated role except Read Only — Standard, Admin, or Superadmin."""
    if user.role == "readonly":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Read-only accounts cannot perform this action")
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Superadmin privileges required")
    return user
