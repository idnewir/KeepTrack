"""Feature module ORM model — the toggle a whole feature area (Reconciliation,
Planned Projects, AI Extraction, ...) is gated on. See services/modules_service.py
and utils/module_guard.py for how enabled/disabled is read and enforced, and
docs/decisions-log.md for why background logic keeps running regardless of
this flag.
"""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from database import Base


class FeatureModule(Base):
    __tablename__ = "feature_modules"

    id = Column(Integer, primary_key=True)
    module_key = Column(String(50), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    label = Column(String(100), nullable=False)
    description = Column(String(500), nullable=False)
    default_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    requires_setup = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
