"""Feature module endpoints: list every module's state (any logged-in user)
and toggle or rename one (Admin only). See services/modules_service.py and
utils/deps.py's require_module for how a module's enabled state is enforced
elsewhere in the API.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import FeatureModuleLabelUpdate, FeatureModuleOut, FeatureModuleUpdate
from models.user import User
from services import audit_service, modules_service
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("", response_model=list[FeatureModuleOut])
def list_modules(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return modules_service.get_all_modules(db)


@router.put("/{module_key}", response_model=FeatureModuleOut)
def update_module(
    module_key: str,
    payload: FeatureModuleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    module = modules_service.get_module(db, module_key)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found")

    if payload.enabled == module.enabled:
        return module

    if payload.enabled:
        return modules_service.enable_module(db, module_key, admin.id)
    return modules_service.disable_module(db, module_key, admin.id)


# Used only by the Debt Tracking / Budget Planning setup prompts, which let
# an Admin rename the module the first time it's enabled ("What would you
# like to call this module?") — every other module's label is fixed.
@router.put("/{module_key}/label", response_model=FeatureModuleOut)
def rename_module(
    module_key: str,
    payload: FeatureModuleLabelUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    module = modules_service.get_module(db, module_key)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found")

    previous_label = module.label
    module.label = payload.label
    db.commit()
    db.refresh(module)

    audit_service.log_action(
        db, "module.renamed", f"Renamed feature module '{previous_label}' to '{module.label}'",
        user_id=admin.id, affected_table="feature_modules", affected_record_id=module.id,
    )
    return module
