"""Setting ORM model — site-wide key/value configuration (see docs/database-schema.md)."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from database import Base


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    # Nullable: a setting can be "not set" (e.g. app_start_date before an
    # Admin configures it) rather than only ever holding a sentinel string.
    # See docs/decisions-log.md.
    # Widened from 500 to 2000 (migration 0026) to fit an encrypted
    # (Fernet) ai_api_key ciphertext, which runs longer than the plaintext
    # key it wraps — same reasoning as widening users.mfa_secret.
    value = Column(String(2000), nullable=True)
    # Nullable: the seeded default row (migration 0007) isn't created by any
    # user. See docs/decisions-log.md.
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
