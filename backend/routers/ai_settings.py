"""AI provider configuration endpoints — Admin only for all of them.

Configuration lives in the `settings` table (ai_provider, ai_model,
ai_endpoint_url, ai_enabled, ai_api_key) via services/ai_provider_service.py,
which also implements the actual provider calls these endpoints exercise
(GET /ai/config reads it back, PUT /ai/config writes it, POST /ai/test
calls it with a trivial prompt, GET /ai/models lists what's available).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import AIConfigOut, AIConfigUpdate, AIProviderModelsOut, AIStatusOut, AITestResultOut
from models.setting import Setting
from models.user import User
from services import ai_provider_service, audit_service
from services.ai_provider_service import (
    AI_TEST_RATE_LIMIT_MAX,
    SUPPORTED_PROVIDERS,
    DEFAULT_MODEL_FOR_PROVIDER,
)
from utils.crypto import encrypt_secret
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status", response_model=AIStatusOut)
def get_ai_status(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Any authenticated user (not just Admin) — the invoice review card
    (Standard and Admin both upload/review invoices) needs to know whether
    to show a "fill in manually" banner, without exposing the full
    provider/model/endpoint configuration GET /ai/config carries."""
    cfg = ai_provider_service.get_ai_config(db)
    api_key, _source = ai_provider_service.resolve_api_key(db, cfg["provider"])

    if ai_provider_service.requires_api_key(cfg["provider"]):
        configured = bool(api_key)
    elif ai_provider_service.requires_endpoint_url(cfg["provider"]):
        configured = bool(cfg["endpoint_url"])
    else:
        configured = True

    return AIStatusOut(enabled=cfg["enabled"], configured=configured)


def _set_setting(db: Session, key: str, value: str | None, admin: User) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        row = Setting(key=key)
        db.add(row)
    row.value = value
    row.updated_by = admin.id


@router.get("/config", response_model=AIConfigOut)
def get_ai_config(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    cfg = ai_provider_service.get_ai_config(db)
    _api_key, source = ai_provider_service.resolve_api_key(db, cfg["provider"])
    return AIConfigOut(
        provider=cfg["provider"],
        model=cfg["model"],
        endpoint_url=cfg["endpoint_url"],
        ai_enabled=cfg["enabled"],
        api_key_set=ai_provider_service.api_key_is_set(db),
        api_key_source=source,
    )


@router.put("/config", response_model=AIConfigOut)
def update_ai_config(
    payload: AIConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported provider. Must be one of: {', '.join(SUPPORTED_PROVIDERS)}",
        )

    if ai_provider_service.requires_endpoint_url(payload.provider) and not (payload.endpoint_url or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An endpoint URL is required for this provider")

    model = (payload.model or "").strip() or DEFAULT_MODEL_FOR_PROVIDER.get(payload.provider)
    if not model and payload.provider not in ("ollama", "custom"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A model must be specified")

    before = ai_provider_service.get_ai_config(db)
    key_was_set = ai_provider_service.api_key_is_set(db)

    _set_setting(db, "ai_provider", payload.provider, admin)
    _set_setting(db, "ai_model", model, admin)
    _set_setting(db, "ai_endpoint_url", (payload.endpoint_url or "").strip() or None, admin)
    _set_setting(db, "ai_enabled", "true" if payload.ai_enabled else "false", admin)

    key_changed = False
    if payload.api_key is not None and payload.api_key.strip():
        _set_setting(db, "ai_api_key", encrypt_secret(payload.api_key.strip()), admin)
        key_changed = True

    db.commit()

    # Never log the key itself — only whether it changed, per the task brief.
    audit_service.log_action(
        db, "settings.changed", f"AI provider configuration updated (provider={payload.provider})",
        user_id=admin.id, affected_table="settings",
        metadata={
            "before": {"provider": before["provider"], "model": before["model"], "enabled": before["enabled"]},
            "after": {"provider": payload.provider, "model": model, "enabled": payload.ai_enabled},
            "api_key_changed": key_changed,
            "api_key_was_set": key_was_set,
        },
    )

    cfg = ai_provider_service.get_ai_config(db)
    _api_key, source = ai_provider_service.resolve_api_key(db, cfg["provider"])
    return AIConfigOut(
        provider=cfg["provider"],
        model=cfg["model"],
        endpoint_url=cfg["endpoint_url"],
        ai_enabled=cfg["enabled"],
        api_key_set=ai_provider_service.api_key_is_set(db),
        api_key_source=source,
    )


@router.post("/test", response_model=AITestResultOut)
def test_ai_connection(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if ai_provider_service.recent_test_count(db, admin.id) >= AI_TEST_RATE_LIMIT_MAX:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many connection tests. Please wait before trying again.",
        )

    result = ai_provider_service.test_connection(db)
    # Not written to audit_log — too noisy for a routine connectivity check
    # (per the task brief) — but still recorded to system_events so the
    # rate limit itself has something to count.
    ai_provider_service.log_test_event(db, admin.id, {"success": result["success"]})
    return AITestResultOut(**result)


@router.get("/models", response_model=dict[str, AIProviderModelsOut])
def get_ai_models(
    endpoint_url: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return ai_provider_service.list_all_provider_models(db, ollama_endpoint_url=endpoint_url)
