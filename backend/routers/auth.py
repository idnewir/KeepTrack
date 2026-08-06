"""Authentication endpoints: first-run setup, login+MFA, self-registration, and approvals."""
import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.schemas import (
    AIConfigOut,
    AIConfigUpdate,
    ApproveUserRequest,
    ForcePasswordChangeRequest,
    LoginRequest,
    LoginResponse,
    MFAVerifyRequest,
    PaginatedResponse,
    PasswordChangeOut,
    PasswordChangeRequest,
    PasswordResetOut,
    ProfileUpdateRequest,
    RegisterRequest,
    RegisterResponse,
    SettingOut,
    SetupAppStartDateRequest,
    SetupRequest,
    SetupResponse,
    SetupStatusResponse,
    TokenResponse,
    UserOut,
    UserRoleUpdate,
    ASSIGNABLE_ROLES,
)
from models.setting import Setting
from models.user import User
from services import ai_provider_service, audit_service, error_service, mfa_remember_service, rate_limit_service
from services.ai_provider_service import DEFAULT_MODEL_FOR_PROVIDER, SUPPORTED_PROVIDERS
from services.auth_service import (
    build_otpauth_uri,
    generate_mfa_secret,
    generate_qr_code_base64,
    mfa_account_name,
    no_setup_users_exist,
    sole_setup_admin,
    verify_totp_code,
)
from services.date_service import APP_START_DATE_KEY
from services.settings_service import FINANCIAL_YEAR_START_MONTH_KEY, get_site_name
from utils.crypto import decrypt_secret, encrypt_secret
from utils.csv_export import csv_response
from utils.deps import get_current_user, require_admin
from utils.pagination import paginate
from utils.security import (
    DUMMY_PASSWORD_HASH,
    SCOPE_ACCESS,
    SCOPE_MFA,
    TokenError,
    create_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/setup-status", response_model=SetupStatusResponse)
def setup_status(db: Session = Depends(get_db)):
    return SetupStatusResponse(setup_required=no_setup_users_exist(db))


@router.post("/setup", response_model=SetupResponse, status_code=status.HTTP_201_CREATED)
def setup(payload: SetupRequest, db: Session = Depends(get_db)):
    if not no_setup_users_exist(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "Setup has already been completed")

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username already taken")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    secret = generate_mfa_secret()
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="admin",
        mfa_secret=encrypt_secret(secret),
        approved=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.created", f"First Admin account '{user.username}' created via setup wizard",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
    )

    otpauth_uri = build_otpauth_uri(secret, mfa_account_name(user.username, get_site_name(db)))
    return SetupResponse(
        user=UserOut.model_validate(user),
        mfa_secret=secret,
        otpauth_uri=otpauth_uri,
        qr_code_png_base64=generate_qr_code_base64(otpauth_uri),
    )


@router.put("/setup/app-start-date", response_model=SettingOut)
def set_setup_app_start_date(payload: SetupAppStartDateRequest, db: Session = Depends(get_db)):
    """Setup wizard step 3 ("When did you start using Keep Track?" / "When does
    your financial year start?"). Unauthenticated like /auth/setup itself, but
    only usable in the same narrow window — see services.auth_service
    .sole_setup_admin and docs/decisions-log.md. The Settings page's own
    controls (PUT /settings/app_start_date, PUT /settings
    /financial_year_start_month) are the ones to use for every later change."""
    admin = sole_setup_admin(db)
    if admin is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Setup has already been completed")

    setting = db.query(Setting).filter(Setting.key == APP_START_DATE_KEY).first()
    if setting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found")

    setting.value = payload.app_start_date.isoformat() if payload.app_start_date else None
    setting.updated_by = admin.id

    if payload.financial_year_start_month is not None:
        fy_setting = db.query(Setting).filter(Setting.key == FINANCIAL_YEAR_START_MONTH_KEY).first()
        if fy_setting is not None:
            fy_setting.value = str(payload.financial_year_start_month)
            fy_setting.updated_by = admin.id

    db.commit()
    db.refresh(setting)
    return setting


@router.put("/setup/ai-config", response_model=AIConfigOut)
def set_setup_ai_config(payload: AIConfigUpdate, db: Session = Depends(get_db)):
    """Setup wizard step 4 ("Configure AI features (optional)"). Unauthenticated
    and gated the same way as /auth/setup/app-start-date above — see
    services.auth_service.sole_setup_admin. Skipping this step in the
    wizard simply leaves the migration-seeded defaults (Anthropic, no key)
    in place; AI can always be configured later via Settings -> AI &
    Extraction (PUT /ai/config), which this endpoint mirrors."""
    admin = sole_setup_admin(db)
    if admin is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Setup has already been completed")

    if payload.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported provider. Must be one of: {', '.join(SUPPORTED_PROVIDERS)}",
        )
    if ai_provider_service.requires_endpoint_url(payload.provider) and not (payload.endpoint_url or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An endpoint URL is required for this provider")

    model = (payload.model or "").strip() or DEFAULT_MODEL_FOR_PROVIDER.get(payload.provider)

    def _set(key: str, value: str | None) -> None:
        row = db.query(Setting).filter(Setting.key == key).first()
        if row is None:
            row = Setting(key=key)
            db.add(row)
        row.value = value
        row.updated_by = admin.id

    _set("ai_provider", payload.provider)
    _set("ai_model", model)
    _set("ai_endpoint_url", (payload.endpoint_url or "").strip() or None)
    _set("ai_enabled", "true" if payload.ai_enabled else "false")
    if payload.api_key and payload.api_key.strip():
        _set("ai_api_key", encrypt_secret(payload.api_key.strip()))
    db.commit()

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


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_mfa_remember_token: str | None = Header(default=None, alias="X-MFA-Remember-Token"),
):
    ip_address = _client_ip(request)

    # Brute-force protection: capped per source IP (not per username, which
    # isn't trustworthy pre-authentication and would let an attacker lock
    # out a real user just by spamming their username). See
    # services/rate_limit_service.py and docs/decisions-log.md.
    if rate_limit_service.is_rate_limited(
        db, rate_limit_service.LOGIN_EVENT_TYPE, ip_address,
        rate_limit_service.LOGIN_MAX_ATTEMPTS, rate_limit_service.LOGIN_WINDOW_MINUTES,
    ):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many login attempts. Please wait a few minutes before trying again.",
        )

    user = db.query(User).filter(User.username == payload.username).first()
    # Always run the bcrypt comparison, even for an unknown username, so the
    # response time doesn't reveal whether the username exists.
    password_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_ok = verify_password(payload.password, password_hash)
    if user is None or not password_ok:
        rate_limit_service.record_attempt(db, rate_limit_service.LOGIN_EVENT_TYPE, ip_address, "invalid_credentials")
        audit_service.log_action(
            db, "user.login_failed", f"Failed login attempt for username '{payload.username}'",
            user_id=user.id if user else None, ip_address=ip_address,
            metadata={"reason": "invalid_credentials"},
        )
        error_service.log_error(
            db, "warning", "auth", f"Failed login attempt for username '{payload.username}'",
            request_path=str(request.url.path),
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    if not user.approved:
        audit_service.log_action(
            db, "user.login_failed", f"Login attempt for unapproved account '{user.username}'",
            user_id=user.id, ip_address=ip_address, metadata={"reason": "pending_approval"},
        )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account pending approval")
    if not user.is_active:
        audit_service.log_action(
            db, "user.login_failed", f"Login attempt for deactivated account '{user.username}'",
            user_id=user.id, ip_address=ip_address, metadata={"reason": "deactivated"},
        )
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account has been deactivated. Please contact an Administrator.",
        )

    # Superadmin is a break-glass recovery account with no MFA step by
    # design (see docs/decisions-log.md). This branches solely on the role
    # stored on the DB row just looked up — nothing in the request payload
    # can reach this check, so it can't be spoofed from the client.
    if user.role == "superadmin":
        user.last_login = datetime.now(timezone.utc)
        db.commit()
        audit_service.log_action(
            db, "user.login", f"Successful login for '{user.username}'",
            user_id=user.id, ip_address=ip_address,
        )

        access_token = create_token(
            subject=user.id,
            scope=SCOPE_ACCESS,
            expiry_minutes=settings.jwt_expiry_minutes,
            extra_claims={"role": user.role},
        )
        return LoginResponse(
            mfa_required=False,
            access_token=access_token,
            expires_in_minutes=settings.jwt_expiry_minutes,
        )

    # A valid remember token from an earlier "remember this session" MFA
    # verification (POST /auth/verify-mfa, remember_session=true) lets this
    # browser skip MFA and go straight to a full access token — password
    # verification above still has to succeed first. See docs/decisions-log.md.
    remember_token = mfa_remember_service.find_valid_token(db, user.id, x_mfa_remember_token)
    if remember_token is not None:
        remember_token.last_used_at = datetime.now(timezone.utc)
        user.last_login = datetime.now(timezone.utc)
        db.commit()
        audit_service.log_action(
            db, "user.login_mfa_remembered", f"Successful login for '{user.username}' (MFA remembered)",
            user_id=user.id, ip_address=ip_address,
        )

        access_token = create_token(
            subject=user.id,
            scope=SCOPE_ACCESS,
            expiry_minutes=settings.jwt_expiry_minutes,
            extra_claims={"role": user.role},
        )
        return LoginResponse(
            mfa_required=False,
            access_token=access_token,
            expires_in_minutes=settings.jwt_expiry_minutes,
        )

    temp_token = create_token(
        subject=user.id, scope=SCOPE_MFA, expiry_minutes=settings.jwt_mfa_expiry_minutes
    )
    return LoginResponse(
        mfa_required=True,
        temp_token=temp_token,
        expires_in_minutes=settings.jwt_mfa_expiry_minutes,
        mfa_remember_hours=mfa_remember_service.get_mfa_remember_hours(db),
    )


@router.post("/verify-mfa", response_model=TokenResponse)
def verify_mfa(payload: MFAVerifyRequest, request: Request, db: Session = Depends(get_db)):
    ip_address = _client_ip(request)

    # Brute-force protection on the 6-digit TOTP code, same shape as
    # /auth/login's — a code has only 10^6 possibilities, so this matters at
    # least as much here. See services/rate_limit_service.py.
    if rate_limit_service.is_rate_limited(
        db, rate_limit_service.MFA_EVENT_TYPE, ip_address,
        rate_limit_service.MFA_MAX_ATTEMPTS, rate_limit_service.MFA_WINDOW_MINUTES,
    ):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many verification attempts. Please wait a few minutes before trying again.",
        )

    try:
        claims = decode_token(payload.temp_token, expected_scope=SCOPE_MFA)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    user = db.get(User, int(claims["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account has been deactivated. Please contact an Administrator.",
        )

    if not verify_totp_code(decrypt_secret(user.mfa_secret), payload.code):
        rate_limit_service.record_attempt(db, rate_limit_service.MFA_EVENT_TYPE, ip_address, "invalid_code")
        audit_service.log_action(
            db, "user.mfa_failed", f"Failed MFA attempt for '{user.username}'",
            user_id=user.id, ip_address=ip_address,
        )
        error_service.log_error(
            db, "warning", "auth", f"Failed MFA attempt for '{user.username}'",
            request_path=str(request.url.path), user_id=user.id,
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication code")

    user.last_login = datetime.now(timezone.utc)
    db.commit()
    audit_service.log_action(
        db, "user.login", f"Successful login for '{user.username}'",
        user_id=user.id, ip_address=ip_address,
    )

    remember_raw_token: str | None = None
    remember_expires_at = None
    if payload.remember_session:
        remember_raw_token, remember_expires_at = mfa_remember_service.create_token(db, user.id)
        audit_service.log_action(
            db, "user.mfa_verified_with_remember", f"MFA verified for '{user.username}' (session remembered)",
            user_id=user.id, ip_address=ip_address,
        )
    else:
        audit_service.log_action(
            db, "user.mfa_verified", f"MFA verified for '{user.username}'",
            user_id=user.id, ip_address=ip_address,
        )

    access_token = create_token(
        subject=user.id,
        scope=SCOPE_ACCESS,
        expiry_minutes=settings.jwt_expiry_minutes,
        extra_claims={"role": user.role},
    )
    return TokenResponse(
        access_token=access_token,
        expires_in_minutes=settings.jwt_expiry_minutes,
        mfa_remember_token=remember_raw_token,
        mfa_remember_expires_at=remember_expires_at,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    x_mfa_remember_token: str | None = Header(default=None, alias="X-MFA-Remember-Token"),
):
    """Purely an audit hook — JWTs are stateless, so there is no server-side
    session to actually invalidate; the frontend just discards its token.
    See docs/decisions-log.md.

    Also revokes this browser's MFA remember token (if the frontend sends
    one via X-MFA-Remember-Token, same header as POST /auth/login) so a
    deliberate logout can't be followed by an MFA-skipped login — see
    docs/decisions-log.md."""
    remember_token = mfa_remember_service.find_valid_token(db, user.id, x_mfa_remember_token)
    if remember_token is not None:
        mfa_remember_service.revoke_token(db, remember_token)

    audit_service.log_action(
        db, "user.logout", f"'{user.username}' logged out", user_id=user.id,
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    ip_address = _client_ip(request)

    # Caps registration spam/enumeration from a single source — see
    # services/rate_limit_service.py.
    if rate_limit_service.is_rate_limited(
        db, rate_limit_service.REGISTER_EVENT_TYPE, ip_address,
        rate_limit_service.REGISTER_MAX_ATTEMPTS, rate_limit_service.REGISTER_WINDOW_MINUTES,
    ):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many registration attempts. Please wait before trying again.",
        )
    rate_limit_service.record_attempt(db, rate_limit_service.REGISTER_EVENT_TYPE, ip_address, "attempted")

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username already taken")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    secret = generate_mfa_secret()
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role="standard",
        mfa_secret=encrypt_secret(secret),
        approved=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.created", f"'{user.username}' self-registered (pending approval)",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
    )

    # Shown once, now, since there is no other point in the registration flow
    # where the user will see it — they need it set up before an Admin
    # approval makes their account usable for login.
    otpauth_uri = build_otpauth_uri(secret, mfa_account_name(user.username, get_site_name(db)))
    return RegisterResponse(
        message="Account created. An Admin must approve it before you can log in.",
        user=UserOut.model_validate(user),
        mfa_secret=secret,
        otpauth_uri=otpauth_uri,
        qr_code_png_base64=generate_qr_code_base64(otpauth_uri),
    )


@router.get("/pending-users", response_model=list[UserOut])
def pending_users(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    return db.query(User).filter(User.approved.is_(False)).order_by(User.created_at).all()


@router.post("/approve-user/{user_id}", response_model=UserOut)
def approve_user(
    user_id: int,
    payload: ApproveUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Role must be one of: {', '.join(ASSIGNABLE_ROLES)}",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    user.role = payload.role
    user.approved = True
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.approved", f"'{user.username}' approved as {payload.role}",
        user_id=admin.id, affected_table="users", affected_record_id=user.id,
        metadata={"role": payload.role},
    )
    return user


def _filtered_users_query(db: Session, approved: bool | None):
    query = db.query(User)
    if approved is not None:
        query = query.filter(User.approved.is_(approved))
    return query.order_by(User.username)


@router.get("/users", response_model=PaginatedResponse[UserOut])
def list_users(
    approved: bool | None = None,
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = _filtered_users_query(db, approved)
    items, pagination = paginate(query, page, per_page)
    return {"data": items, "pagination": pagination}


@router.get("/users/export/csv")
def export_users_csv(
    approved: bool | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    users = _filtered_users_query(db, approved).all()
    rows = [
        [
            u.username,
            u.display_name or "",
            u.email,
            u.role,
            "Active" if u.is_active else "Inactive",
            u.created_at.strftime("%Y-%m-%d %H:%M"),
            u.last_login.strftime("%Y-%m-%d %H:%M") if u.last_login else "Never",
        ]
        for u in users
    ]
    return csv_response(
        "users_export.csv",
        ["Username", "Display Name", "Email", "Role", "Status", "Created", "Last Login"],
        rows,
    )


def _reject_action_on_self_or_superadmin(target: User, admin: User, action: str) -> None:
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot {action} your own account")
    if target.role == "superadmin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot {action} the Superadmin account")


@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Role must be one of: {', '.join(ASSIGNABLE_ROLES)}",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    _reject_action_on_self_or_superadmin(user, admin, "change the role of")

    previous_role = user.role
    user.role = payload.role
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.role_changed", f"Role for '{user.username}' changed from {previous_role} to {payload.role}",
        user_id=admin.id, affected_table="users", affected_record_id=user.id,
        metadata={"before": previous_role, "after": payload.role},
    )
    return user


@router.put("/users/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    _reject_action_on_self_or_superadmin(user, admin, "deactivate")

    user.is_active = False
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.deactivated", f"'{user.username}' deactivated",
        user_id=admin.id, affected_table="users", affected_record_id=user.id,
    )
    return user


@router.put("/users/{user_id}/reactivate", response_model=UserOut)
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.reactivated", f"'{user.username}' reactivated",
        user_id=admin.id, affected_table="users", affected_record_id=user.id,
    )
    return user


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetOut)
def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    _reject_action_on_self_or_superadmin(user, admin, "reset the password of")

    alphabet = string.ascii_letters + string.digits
    temporary_password = "".join(secrets.choice(alphabet) for _ in range(8))

    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    # The target user's existing sessions (if any survived until now) should
    # not keep working under their old password's token — see
    # docs/decisions-log.md.
    user.token_invalid_before = datetime.now(timezone.utc)
    db.commit()

    audit_service.log_action(
        db, "user.password_reset", f"Password reset by Admin for '{user.username}'",
        user_id=admin.id, affected_table="users", affected_record_id=user.id,
    )

    return PasswordResetOut(temporary_password=temporary_password, must_change_password=True)


@router.delete("/reject-user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def reject_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.approved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot reject an already-approved user")

    username = user.username
    db.delete(user)
    db.commit()

    audit_service.log_action(
        db, "user.rejected", f"Registration for '{username}' rejected", user_id=admin.id,
    )


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return UserOut.model_validate(user).model_copy(
        update={
            "session_timeout_minutes": mfa_remember_service.get_session_timeout_minutes(db),
            "mfa_remember_active": mfa_remember_service.has_active_token(db, user.id),
        }
    )


@router.delete("/mfa-remember", status_code=status.HTTP_204_NO_CONTENT)
def revoke_mfa_remember(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Revokes every active MFA remember token for the current user —
    available to any logged-in user, e.g. from the Profile page's "Revoke"
    button, to force a full MFA check on their next login regardless of
    which device the remembered session lives on. See docs/decisions-log.md."""
    mfa_remember_service.revoke_all_for_user(db, user.id)
    audit_service.log_action(
        db, "user.mfa_remember_revoked", f"'{user.username}' revoked their remembered MFA session",
        user_id=user.id,
    )


@router.post("/welcome/dismiss", response_model=UserOut)
def dismiss_welcome(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Marks the one-off first-login welcome overlay as seen. Idempotent —
    dismissing an already-dismissed welcome is a no-op, not an error, since
    the frontend may call this from more than one dismissal path (Get
    started, a quick-start card, or "Don't show this again")."""
    if not user.has_seen_welcome:
        user.has_seen_welcome = True
        db.commit()
        db.refresh(user)
    return user


@router.put("/me/profile", response_model=UserOut)
def update_my_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = db.query(User).filter(User.email == payload.email, User.id != user.id).first()
    if existing is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    user.display_name = payload.display_name.strip() if payload.display_name else None
    user.email = payload.email
    db.commit()
    db.refresh(user)
    return user


@router.put("/me/password", response_model=PasswordChangeOut)
def change_my_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    # Invalidates every token issued before this moment, including the one
    # this very request used — a changed password should mean every prior
    # session (this device's included) needs a fresh login. See
    # docs/decisions-log.md and utils/deps.get_current_user.
    user.token_invalid_before = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.password_changed", f"'{user.username}' changed their own password",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
    )

    new_token = create_token(
        subject=user.id, scope=SCOPE_ACCESS, expiry_minutes=settings.jwt_expiry_minutes,
        extra_claims={"role": user.role},
    )
    return PasswordChangeOut(user=user, access_token=new_token, expires_in_minutes=settings.jwt_expiry_minutes)


@router.put("/me/force-password-change", response_model=PasswordChangeOut)
def force_change_my_password(
    payload: ForcePasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """No current-password check: only reachable with a valid access token,
    which the user just obtained by authenticating with their (temporary)
    current password moments earlier. Used by the forced-change redirect
    that follows an Admin password reset — see docs/decisions-log.md."""
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.token_invalid_before = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.password_changed", f"'{user.username}' set a new password (forced change)",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
        metadata={"forced": True},
    )

    new_token = create_token(
        subject=user.id, scope=SCOPE_ACCESS, expiry_minutes=settings.jwt_expiry_minutes,
        extra_claims={"role": user.role},
    )
    return PasswordChangeOut(user=user, access_token=new_token, expires_in_minutes=settings.jwt_expiry_minutes)
