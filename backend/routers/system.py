"""System-wide, Superadmin-only actions — currently just POST /system/reset,
which wipes all app data and returns Keep Track to its first-run state.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import SystemResetRequest, SystemResetResponse
from models.user import User
from services import audit_service
from services.system_reset_service import (
    RATE_LIMIT_MAX_ATTEMPTS,
    RESET_CONFIRMATION_PHRASE,
    log_reset_event,
    perform_reset,
    recent_attempt_count,
)
from utils.deps import get_current_user
from utils.security import verify_password

router = APIRouter(prefix="/system", tags=["system"])


@router.post("/reset", response_model=SystemResetResponse)
def system_reset(
    payload: SystemResetRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Checked against the role column on the User row get_current_user just
    # loaded from the database this request — not any role claim carried in
    # the JWT itself — per the security requirement. See docs/decisions-log.md.
    if user.role != "superadmin":
        log_reset_event(
            db, "system_reset_failed", user.id,
            {"reason": "not_superadmin", "wipe_files": payload.wipe_files},
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Superadmin privileges required")

    if recent_attempt_count(db, user.id) >= RATE_LIMIT_MAX_ATTEMPTS:
        log_reset_event(db, "system_reset_rate_limited", user.id, {"wipe_files": payload.wipe_files})
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many reset attempts. Please wait an hour before trying again.",
        )

    if payload.confirmation_phrase != RESET_CONFIRMATION_PHRASE:
        log_reset_event(
            db, "system_reset_failed", user.id,
            {"reason": "invalid_confirmation_phrase", "wipe_files": payload.wipe_files},
        )
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Confirmation phrase does not match. Type '{RESET_CONFIRMATION_PHRASE}' exactly.",
        )

    if not verify_password(payload.superadmin_password, user.password_hash):
        log_reset_event(
            db, "system_reset_failed", user.id,
            {"reason": "invalid_password", "wipe_files": payload.wipe_files},
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect Superadmin password.")

    # Logged and committed before anything is deleted, per the security
    # requirement — this row survives even if the reset below fails partway.
    # Two separate logs, deliberately: system_events (rate-limiting, already
    # exempt from the reset itself) and audit_log (the new, user-facing Logs
    # viewer) — see docs/decisions-log.md.
    log_reset_event(db, "system_reset_success", user.id, {"wipe_files": payload.wipe_files})
    audit_service.log_action(
        db, "system.reset", f"System reset performed by '{user.username}' (wipe_files={payload.wipe_files})",
        user_id=user.id,
    )

    perform_reset(db, wipe_files=payload.wipe_files)

    return SystemResetResponse(
        message="Keep Track has been reset to its first-run state.",
        reset_at=datetime.now(timezone.utc),
    )
