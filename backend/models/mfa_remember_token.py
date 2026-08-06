"""MfaRememberToken ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from database import Base


class MfaRememberToken(Base):
    __tablename__ = "mfa_remember_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # SHA-256 hex digest of the raw token — the raw value is only ever
    # returned once, in the POST /auth/verify-mfa response, and is not
    # recoverable from this column. See docs/decisions-log.md.
    token_hash = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked = Column(Boolean, nullable=False, default=False, server_default="false")
