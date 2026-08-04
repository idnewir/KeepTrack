"""Site-wide settings endpoints: view all settings, update one by key (Admin only)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import SettingOut, SettingUpdate
from models.setting import Setting
from models.user import User
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=list[SettingOut])
def list_settings(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return db.query(Setting).order_by(Setting.key).all()


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

    setting.value = payload.value
    setting.updated_by = admin.id
    db.commit()
    db.refresh(setting)
    return setting
