"""Auth business logic: TOTP/QR generation and superadmin bootstrap."""
import base64
import logging
from io import BytesIO

import pyotp
import qrcode
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from models.user import User
from services.settings_service import get_site_name
from utils.crypto import encrypt_secret
from utils.security import hash_password

logger = logging.getLogger("keep_track.auth")


def generate_mfa_secret() -> str:
    return pyotp.random_base32()


def mfa_account_name(username: str, site_name: str) -> str:
    """The label an authenticator app shows under the issuer, e.g. 'KHOC
    (richard)'. Falls back to the issuer name itself when site_name hasn't
    been customised, so a default install still reads 'KeepTrack (richard)'
    rather than repeating 'Keep Track (richard)'."""
    if site_name and site_name != "Keep Track":
        return f"{site_name} ({username})"
    return f"{settings.totp_issuer} ({username})"


def build_otpauth_uri(secret: str, account_name: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=account_name, issuer_name=settings.totp_issuer
    )


def verify_totp_code(secret: str, code: str) -> bool:
    # pyotp's default interval is 30 seconds; valid_window=1 tolerates one
    # step of clock drift either side, per the security requirement.
    return pyotp.TOTP(secret, interval=30).verify(code, valid_window=1)


def generate_qr_code_base64(otpauth_uri: str) -> str:
    img = qrcode.make(otpauth_uri)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def no_setup_users_exist(db: Session) -> bool:
    """True if no user other than the env-bootstrapped superadmin exists."""
    count = db.query(func.count(User.id)).filter(User.role != "superadmin").scalar()
    return count == 0


def sole_setup_admin(db: Session) -> User | None:
    """The Admin just created by the setup wizard, if it's still the only
    non-Superadmin account — the narrow window the wizard's optional
    app-start-date step (SetupPage) writes in, before any access token
    exists (POST /auth/setup never logs the new Admin in — MFA hasn't been
    verified yet). Returns None once a second user exists, closing the
    window for good. See docs/decisions-log.md."""
    non_superadmins = db.query(User).filter(User.role != "superadmin").all()
    if len(non_superadmins) == 1 and non_superadmins[0].role == "admin":
        return non_superadmins[0]
    return None


def ensure_superadmin(db: Session) -> None:
    """Create the Superadmin account from env vars if it doesn't exist yet.

    Credentials are sourced from SUPERADMIN_USERNAME / _EMAIL / _PASSWORD so
    the recovery account never depends on the setup wizard. Runs once at
    startup; an existing Superadmin row is left untouched (no silent
    password rotation on every restart).
    """
    if not (settings.superadmin_username and settings.superadmin_email and settings.superadmin_password):
        return

    existing = db.query(User).filter(User.role == "superadmin").first()
    if existing:
        return

    secret = generate_mfa_secret()
    user = User(
        username=settings.superadmin_username,
        email=settings.superadmin_email,
        password_hash=hash_password(settings.superadmin_password),
        role="superadmin",
        mfa_secret=encrypt_secret(secret),
        approved=True,
    )
    db.add(user)
    db.commit()

    otpauth_uri = build_otpauth_uri(secret, mfa_account_name(settings.superadmin_username, get_site_name(db)))
    logger.warning(
        "Superadmin account '%s' created from environment variables. "
        "Scan this URI with an authenticator app now — it will not be shown again: %s",
        settings.superadmin_username,
        otpauth_uri,
    )
