"""Budget Planning ORM models: an annual category budget with optional
monthly overrides, a savings goal, and the dedup tracker that stops an
80%/over-budget notification firing more than once per category per month.
See docs/decisions-log.md.
"""
from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from database import Base

SAVINGS_GOAL_STATUSES = ("active", "completed", "cancelled")
NOTIFICATION_TYPES = ("warning_80", "over_budget")


class CategoryBudget(Base):
    __tablename__ = "category_budgets"
    __table_args__ = (
        UniqueConstraint("category_id", "financial_year_id", name="uq_category_budgets_category_fy"),
    )

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=False)
    annual_amount = Column(Numeric(12, 2), nullable=False)
    # Optional per-month overrides as {"1": 300, "12": 600} — a month with no
    # entry here falls back to annual_amount / 12. See services/budget_service.py.
    monthly_amounts = Column(JSON, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    __table_args__ = (
        CheckConstraint(f"status IN {SAVINGS_GOAL_STATUSES}", name="ck_savings_goals_status"),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    target_amount = Column(Numeric(12, 2), nullable=False)
    target_date = Column(Date, nullable=False)
    current_amount = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=True)
    status = Column(String(20), nullable=False, default="active", server_default="active")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class BudgetNotificationSent(Base):
    """One row per (category, financial year, month, threshold) that has ever
    fired — existence of a row is the guard against re-notifying the same
    80%/over-budget threshold within the same month."""

    __tablename__ = "budget_notifications_sent"
    __table_args__ = (
        CheckConstraint(f"notification_type IN {NOTIFICATION_TYPES}", name="ck_budget_notifications_sent_type"),
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_budget_notifications_sent_month"),
        UniqueConstraint(
            "category_id", "financial_year_id", "month", "notification_type",
            name="uq_budget_notifications_sent_category_fy_month_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=False)
    month = Column(Integer, nullable=False)
    notification_type = Column(String(20), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
