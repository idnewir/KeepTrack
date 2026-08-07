"""Debt Tracking ORM models: a debt record, its logged payments, and the
milestone-notification tracker that stops a 25/50/75/100% milestone firing
more than once. See docs/decisions-log.md.
"""
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from database import Base

DEBT_TYPES = ("credit_card", "loan", "mortgage", "car_finance", "overdraft", "bnpl", "other")
RATE_TYPES = ("standard", "promotional", "zero")
MILESTONE_PERCENTS = (25, 50, 75, 100)


class Debt(Base):
    __tablename__ = "debts"
    __table_args__ = (
        CheckConstraint(f"debt_type IN {DEBT_TYPES}", name="ck_debts_debt_type"),
        CheckConstraint(f"rate_type IN {RATE_TYPES}", name="ck_debts_rate_type"),
        CheckConstraint("payment_due_day BETWEEN 1 AND 31", name="ck_debts_payment_due_day"),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    debt_type = Column(String(30), nullable=False)
    custom_type_label = Column(String(100), nullable=True)
    current_balance = Column(Numeric(12, 2), nullable=False)
    # Set once, at creation, to current_balance — the fixed starting point
    # percent_paid is measured against. See services/debt_service.py.
    original_balance = Column(Numeric(12, 2), nullable=False)
    credit_limit = Column(Numeric(12, 2), nullable=True)
    monthly_payment = Column(Numeric(12, 2), nullable=False)
    payment_due_day = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    expected_end_date = Column(Date, nullable=True)
    interest_rate = Column(Numeric(6, 3), nullable=False)
    rate_type = Column(String(20), nullable=False, default="standard", server_default="standard")
    promotional_end_date = Column(Date, nullable=True)
    standard_rate_after_promo = Column(Numeric(6, 3), nullable=True)
    notes = Column(Text, nullable=True)
    is_paid_off = Column(Boolean, nullable=False, default=False, server_default="false")
    paid_off_date = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class DebtPayment(Base):
    __tablename__ = "debt_payments"

    id = Column(Integer, primary_key=True)
    debt_id = Column(Integer, ForeignKey("debts.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_date = Column(Date, nullable=False)
    notes = Column(String(500), nullable=True)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DebtMilestone(Base):
    """One row per milestone that has ever fired for a debt — existence of a
    row is the guard against re-notifying the same 25/50/75/100% threshold."""

    __tablename__ = "debt_milestones"
    __table_args__ = (
        CheckConstraint(f"milestone_percent IN {MILESTONE_PERCENTS}", name="ck_debt_milestones_percent"),
        UniqueConstraint("debt_id", "milestone_percent", name="uq_debt_milestones_debt_percent"),
    )

    id = Column(Integer, primary_key=True)
    debt_id = Column(Integer, ForeignKey("debts.id", ondelete="CASCADE"), nullable=False)
    milestone_percent = Column(Integer, nullable=False)
    notified_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
