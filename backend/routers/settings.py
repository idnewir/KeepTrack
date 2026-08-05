"""Site-wide settings endpoints: view all settings, update one by key (Admin only)."""
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import SettingOut, SettingUpdate, TerminologyOut, TerminologyUpdate
from models.setting import Setting
from models.user import User
from services import audit_service
from services.settings_service import get_terminology
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/settings", tags=["settings"])

_VALID_MONTHS = {str(m) for m in range(1, 13)}


@router.get("", response_model=list[SettingOut])
def list_settings(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    # ai_api_key is excluded even though it's encrypted at rest — this
    # listing is readable by every authenticated role (Read Only included),
    # and the dedicated GET /ai/config (Admin only) already exposes
    # everything about it a client legitimately needs (api_key_set,
    # api_key_source) without ever returning the ciphertext. See
    # docs/decisions-log.md.
    return db.query(Setting).filter(Setting.key != "ai_api_key").order_by(Setting.key).all()


@router.get("/terminology", response_model=TerminologyOut)
def get_terminology_settings(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    # Any logged-in user, not just Admin — the frontend needs these to
    # render navigation and page titles for every role. See docs/decisions-log.md.
    return get_terminology(db)


@router.put("/terminology", response_model=TerminologyOut)
def update_terminology_settings(
    payload: TerminologyUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in updates.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        before = setting.value if setting is not None else None
        if setting is None:
            setting = Setting(key=key)
            db.add(setting)
        setting.value = value
        setting.updated_by = admin.id
        db.commit()
        audit_service.log_action(
            db, "settings.changed", f"Setting '{key}' changed",
            user_id=admin.id, affected_table="settings", affected_record_id=setting.id,
            metadata={"key": key, "before": before, "after": value},
        )
    return get_terminology(db)


@router.put("/{key}", response_model=SettingOut)
def update_setting(
    key: str,
    payload: SettingUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found")

    # ai_api_key must always go through PUT /ai/config, which encrypts it
    # before storing — this generic endpoint would otherwise write it as
    # plaintext. See docs/decisions-log.md.
    if key == "ai_api_key":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use PUT /ai/config to change the AI API key")

    if key == "financial_year_start_month" and payload.value not in _VALID_MONTHS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Financial year start month must be between 1 and 12")

    if key == "reserve_calculation" and payload.value not in ("automatic", "manual"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reserve calculation must be 'automatic' or 'manual'")

    if key == "reserve_months" and payload.value not in _VALID_MONTHS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reserve months must be between 1 and 12")

    if key == "reserve_manual_amount":
        try:
            if Decimal(payload.value) < 0:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reserve manual amount must not be negative")
        except InvalidOperation:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reserve manual amount must be a number")

    before = setting.value
    setting.value = payload.value
    setting.updated_by = admin.id
    db.commit()
    db.refresh(setting)

    audit_service.log_action(
        db, "settings.changed", f"Setting '{key}' changed",
        user_id=admin.id, affected_table="settings", affected_record_id=setting.id,
        metadata={"key": key, "before": before, "after": payload.value},
    )
    return setting


@router.delete("/{key}", response_model=SettingOut)
def clear_setting(
    key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Clear a setting back to "not set" (NULL) rather than deleting the row —
    e.g. app_start_date's "Clear" button, which should show all months again."""
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found")

    before = setting.value
    setting.value = None
    setting.updated_by = admin.id
    db.commit()
    db.refresh(setting)

    audit_service.log_action(
        db, "settings.changed", f"Setting '{key}' cleared",
        user_id=admin.id, affected_table="settings", affected_record_id=setting.id,
        metadata={"key": key, "before": before, "after": None},
    )
    return setting
