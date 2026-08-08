"""TransactionRule ORM model — auto-categorisation rules matched against an
invoice's supplier name. See docs/database-schema.md and docs/decisions-log.md.
"""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, func

from database import Base

MATCH_TYPES = ("exact", "contains", "starts_with")


class TransactionRule(Base):
    __tablename__ = "transaction_rules"
    __table_args__ = (
        CheckConstraint(f"match_type IN {MATCH_TYPES}", name="ck_transaction_rules_match_type"),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    match_type = Column(String(20), nullable=False, default="contains", server_default="contains")
    match_value = Column(String(255), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    priority = Column(Integer, nullable=False, default=0, server_default="0")
    active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
