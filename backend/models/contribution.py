"""Contribution ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, func

from database import Base


class Contribution(Base):
    __tablename__ = "contributions"
    __table_args__ = (
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_contributions_month"),
    )

    id = Column(Integer, primary_key=True)
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=False)
    month = Column(SmallInteger, nullable=False)
    group_name = Column(String(100), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Not in the documented schema — added to support soft delete on
    # DELETE /contributions/{id}, matching the invoices.deleted precedent.
    # See docs/decisions-log.md.
    deleted = Column(Boolean, nullable=False, default=False, server_default="false")
