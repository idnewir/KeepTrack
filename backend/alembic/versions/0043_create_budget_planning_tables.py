"""create budget planning tables (category_budgets, savings_goals,
budget_notifications_sent) and terminology settings

Revision ID: 8ce19457f7da
Revises: e8b402ca7096
Create Date: 2026-08-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ce19457f7da'
down_revision: Union[str, None] = 'e8b402ca7096'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SAVINGS_GOAL_STATUSES = ("active", "completed", "cancelled")
NOTIFICATION_TYPES = ("warning_80", "over_budget")

# Seeded so terminology settings always exist by the time Budget Planning is
# first enabled — same pattern as Debt Tracking's own settings (migration
# 0042). GET falls back to these values in code regardless, but seeding
# avoids a "missing row" edge case on a fresh install.
DEFAULT_SETTINGS = [
    {"key": "budget_term_module", "value": "Budget Planning"},
    {"key": "budget_term_budget", "value": "Budget"},
    {"key": "budget_term_savings_goal", "value": "Savings Goal"},
]


def upgrade() -> None:
    op.create_table(
        "category_budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("financial_year_id", sa.Integer(), sa.ForeignKey("financial_years.id"), nullable=False),
        sa.Column("annual_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("monthly_amounts", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint("category_id", "financial_year_id", name="uq_category_budgets_category_fy"),
    )
    op.create_index("idx_category_budgets_financial_year_id", "category_budgets", ["financial_year_id"])

    op.create_table(
        "savings_goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("target_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("current_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("financial_year_id", sa.Integer(), sa.ForeignKey("financial_years.id"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.CheckConstraint(f"status IN {SAVINGS_GOAL_STATUSES}", name="ck_savings_goals_status"),
    )
    op.create_index("idx_savings_goals_status", "savings_goals", ["status"])

    op.create_table(
        "budget_notifications_sent",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("financial_year_id", sa.Integer(), sa.ForeignKey("financial_years.id"), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("notification_type", sa.String(length=20), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(f"notification_type IN {NOTIFICATION_TYPES}", name="ck_budget_notifications_sent_type"),
        sa.CheckConstraint("month BETWEEN 1 AND 12", name="ck_budget_notifications_sent_month"),
        sa.UniqueConstraint(
            "category_id", "financial_year_id", "month", "notification_type",
            name="uq_budget_notifications_sent_category_fy_month_type",
        ),
    )

    settings_table = sa.table(
        "settings",
        sa.column("key", sa.String),
        sa.column("value", sa.String),
    )
    op.bulk_insert(settings_table, DEFAULT_SETTINGS)


def downgrade() -> None:
    settings_table = sa.table("settings", sa.column("key", sa.String))
    op.execute(
        settings_table.delete().where(
            settings_table.c.key.in_([row["key"] for row in DEFAULT_SETTINGS])
        )
    )

    op.drop_table("budget_notifications_sent")

    op.drop_index("idx_savings_goals_status", table_name="savings_goals")
    op.drop_table("savings_goals")

    op.drop_index("idx_category_budgets_financial_year_id", table_name="category_budgets")
    op.drop_table("category_budgets")
