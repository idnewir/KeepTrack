"""Authentication endpoints: first-run setup, login+MFA, self-registration, and approvals."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.schemas import (
    ApproveUserRequest,
    LoginRequest,
    LoginResponse,
    MFAVerifyRequest,
    RegisterRequest,
    RegisterResponse,
    SettingOut,
    SetupAppStartDateRequest,
    SetupRequest,
    SetupResponse,
    SetupStatusResponse,
    TokenResponse,
    UserOut,
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
from utils.crypto import decrypt_secret, encrypt_secret
from utils.deps import get_current_user, require_admin
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
    """Setup wizard step 3 ("When did you start using Keep Track?"). Unauthenticated
    like /auth/setup itself, but only usable in the same narrow window — see
    services.auth_service.sole_setup_admin and docs/decisions-log.md. The
    Settings page's own app_start_date control (PUT /settings/app_start_date)
    is the one to use for every later change."""
    admin = sole_setup_admin(db)
    if admin is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Setup has already been completed")

    setting = db.query(Setting).filter(Setting.key == APP_START_DATE_KEY).first()
    if setting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found")

    setting.value = payload.app_start_date.isoformat() if payload.app_start_date else None
    setting.updated_by = admin.id
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

    # Superadmin is a break-glass recovery account with no MFA step by
    # design (see docs/decisions-log.md). This branches solely on the role
    # stored on the DB row just looked up — nothing in the request payload
    # can reach this check, so it can't be spoofed from the client.
    if user.role == "superadmin":
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

    if not verify_totp_code(decrypt_secret(user.mfa_secret), payload.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication code")

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


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
