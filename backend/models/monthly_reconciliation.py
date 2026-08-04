"""Monthly reconciliation ORM model.

`month` is stored as a DATE (first of the month), not the SMALLINT (1-12)
documented in docs/database-schema.md, and `notes` is split into
`discrepancy_notes` (user-entered) and `suggested_reason` (system-generated)
rather than the doc's single `notes` column — both required by this task's
brief. See docs/decisions-log.md.
"""
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, func

from database import Base


class MonthlyReconciliation(Base):
    __tablename__ = "monthly_reconciliations"
    __table_args__ = (
        UniqueConstraint("financial_year_id", "month", name="uq_monthly_reconciliations_fy_month"),
    )

    id = Column(Integer, primary_key=True)
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=False)
    month = Column(Date, nullable=False)
    calculated_balance = Column(Numeric(12, 2), nullable=False)
    actual_balance = Column(Numeric(12, 2), nullable=False)
    discrepancy = Column(Numeric(12, 2), nullable=False)
    discrepancy_notes = Column(Text, nullable=True)
    suggested_reason = Column(Text, nullable=True)
    reconciled_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    reconciled_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
