"""Authentication endpoints: first-run setup, login+MFA, self-registration, and approvals."""
import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.schemas import (
    ApproveUserRequest,
    ForcePasswordChangeRequest,
    LoginRequest,
    LoginResponse,
    MFAVerifyRequest,
    PaginatedResponse,
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
from services.auth_service import (
    build_otpauth_uri,
    generate_mfa_secret,
    generate_qr_code_base64,
    no_setup_users_exist,
    sole_setup_admin,
    verify_totp_code,
)
from services.date_service import APP_START_DATE_KEY
from services.settings_service import FINANCIAL_YEAR_START_MONTH_KEY
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

    otpauth_uri = build_otpauth_uri(secret, user.email)
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


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    # Always run the bcrypt comparison, even for an unknown username, so the
    # response time doesn't reveal whether the username exists.
    password_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_ok = verify_password(payload.password, password_hash)
    if user is None or not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    if not user.approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account pending approval")
    if not user.is_active:
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
    )


@router.post("/verify-mfa", response_model=TokenResponse)
def verify_mfa(payload: MFAVerifyRequest, db: Session = Depends(get_db)):
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
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication code")

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    access_token = create_token(
        subject=user.id,
        scope=SCOPE_ACCESS,
        expiry_minutes=settings.jwt_expiry_minutes,
        extra_claims={"role": user.role},
    )
    return TokenResponse(access_token=access_token, expires_in_minutes=settings.jwt_expiry_minutes)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
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

    # Shown once, now, since there is no other point in the registration flow
    # where the user will see it — they need it set up before an Admin
    # approval makes their account usable for login.
    otpauth_uri = build_otpauth_uri(secret, user.email)
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
    _admin: User = Depends(require_admin),
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

    user.role = payload.role
    db.commit()
    db.refresh(user)
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
    return user


@router.put("/users/{user_id}/reactivate", response_model=UserOut)
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    user.is_active = True
    db.commit()
    db.refresh(user)
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
    db.commit()

    return PasswordResetOut(temporary_password=temporary_password, must_change_password=True)


@router.delete("/reject-user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def reject_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.approved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot reject an already-approved user")

    db.delete(user)
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
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


@router.put("/me/password", response_model=UserOut)
def change_my_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return user


@router.put("/me/force-password-change", response_model=UserOut)
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
    db.commit()
    db.refresh(user)
    return user
