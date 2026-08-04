"""Setting ORM model — site-wide key/value configuration (see docs/database-schema.md)."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from database import Base


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(String(500), nullable=False)
    # Nullable: the seeded default row (migration 0007) isn't created by any
    # user. See docs/decisions-log.md.
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
