"""User ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Integer, String, func

from database import Base

ROLES = ("superadmin", "admin", "standard", "readonly")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(f"role IN {ROLES}", name="ck_users_role"),
    )

    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(150), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    # Widened from the documented VARCHAR(64): that size fits a raw TOTP
    # secret but not one encrypted at rest (ciphertext + nonce + auth tag).
    # See docs/decisions-log.md.
    mfa_secret = Column(String(255), nullable=False)
    approved = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    must_change_password = Column(Boolean, nullable=False, default=False, server_default="false")
    # Stamped with "now" whenever this user's password changes (self-service
    # change, forced change, or an Admin's reset) so every JWT issued before
    # that moment stops working immediately — otherwise a stolen token would
    # keep working for up to its full 8-hour life even after the password
    # that (maybe) leaked alongside it was changed. Checked in
    # utils/deps.get_current_user against the token's iat claim, the same
    # pattern already used for the global JWT_INVALIDATE_BEFORE_KEY setting
    # (see docs/decisions-log.md), but scoped to one user instead of everyone.
    token_invalid_before = Column(DateTime(timezone=True), nullable=True)
    # Flips to true the first time this user dismisses the one-off welcome
    # overlay shown after their first login — see docs/decisions-log.md.
    has_seen_welcome = Column(Boolean, nullable=False, default=False, server_default="false")
    # Path to an uploaded profile picture under
    # services/profile_service.py's avatar storage root. Mutually exclusive
    # with avatar_url at the application layer — avatar_url wins if both are
    # somehow set. See docs/decisions-log.md.
    avatar_path = Column(String(500), nullable=True)
    # External avatar image (Gravatar, DiceBear, any direct image URL).
    avatar_url = Column(String(1000), nullable=True)
    # Path to an uploaded signature image (always stored as PNG with a
    # transparent background) under services/profile_service.py's signature
    # storage root, used to auto-fill the signing panel.
    signature_path = Column(String(500), nullable=True)

    @property
    def has_avatar(self) -> bool:
        return bool(self.avatar_path)

    @property
    def has_signature(self) -> bool:
        return bool(self.signature_path)
