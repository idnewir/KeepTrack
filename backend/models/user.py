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
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    # Widened from the documented VARCHAR(64): that size fits a raw TOTP
    # secret but not one encrypted at rest (ciphertext + nonce + auth tag).
    # See docs/decisions-log.md.
    mfa_secret = Column(String(255), nullable=False)
    approved = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
