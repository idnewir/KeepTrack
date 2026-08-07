"""Feature module toggles — whether a whole feature area (Reconciliation,
Planned Projects, AI Extraction, ...) is visible in navigation and reachable
via the API.

Background logic (forecasting, reconciliation staleness checks, notification
generation, the folder watcher, etc.) always keeps running regardless of a
module's enabled state — only UI visibility and API access are gated. This
means data never goes stale or missing while a module is off, and re-enabling
it restores full access instantly rather than needing to "catch up". See
docs/decisions-log.md.
"""
from sqlalchemy.orm import Session

from models.feature_module import FeatureModule
from services import audit_service


def get_all_modules(db: Session) -> list[FeatureModule]:
    return db.query(FeatureModule).order_by(FeatureModule.id).all()


def get_module(db: Session, module_key: str) -> FeatureModule | None:
    return db.query(FeatureModule).filter(FeatureModule.module_key == module_key).first()


def is_enabled(db: Session, module_key: str) -> bool:
    """Defaults to enabled when a module row is somehow missing (shouldn't
    happen post-migration) — a missing row should never silently lock a
    feature everyone assumes is on."""
    module = get_module(db, module_key)
    return module is None or module.enabled


def enable_module(db: Session, module_key: str, user_id: int) -> FeatureModule:
    module = get_module(db, module_key)
    if module is None:
        raise ValueError(f"Unknown module: {module_key}")
    module.enabled = True
    db.commit()
    db.refresh(module)
    audit_service.log_action(
        db, "module.enabled", f"Enabled feature module '{module.label}'",
        user_id=user_id, affected_table="feature_modules", affected_record_id=module.id,
    )
    return module


def disable_module(db: Session, module_key: str, user_id: int) -> FeatureModule:
    module = get_module(db, module_key)
    if module is None:
        raise ValueError(f"Unknown module: {module_key}")
    module.enabled = False
    db.commit()
    db.refresh(module)
    audit_service.log_action(
        db, "module.disabled", f"Disabled feature module '{module.label}'",
        user_id=user_id, affected_table="feature_modules", affected_record_id=module.id,
    )
    return module


def modules_state(db: Session) -> dict[str, bool]:
    """module_key -> enabled for every module — the shape embedded in both
    GET /modules and GET /notifications/count's `modules` object, so the
    frontend's 30-second poll and its on-load fetch agree on the exact same
    keys. See docs/decisions-log.md."""
    return {m.module_key: m.enabled for m in get_all_modules(db)}
