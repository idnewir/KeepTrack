"""create debt tracking tables (debts, debt_payments, debt_milestones) and terminology settings

Revision ID: e8b402ca7096
Revises: 0012ffa339a9
Create Date: 2026-08-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b402ca7096'
down_revision: Union[str, None] = '0012ffa339a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEBT_TYPES = ("credit_card", "loan", "mortgage", "car_finance", "overdraft", "bnpl", "other")
RATE_TYPES = ("standard", "promotional", "zero")

# Seeded so terminology settings always exist by the time Debt Tracking is
# first enabled, the same pattern folder integration's settings use
# (migration 0041) — GET falls back to these values in code regardless, but
# seeding avoids a "missing row" edge case on a fresh install.
DEFAULT_SETTINGS = [
    {"key": "debt_term_module", "value": "Debt Tracking"},
    {"key": "debt_term_debt", "value": "Debt"},
    {"key": "debt_term_payment", "value": "Payment"},
]


def upgrade() -> None:
    op.create_table(
        "debts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("debt_type", sa.String(length=30), nullable=False),
        sa.Column("custom_type_label", sa.String(length=100), nullable=True),
        sa.Column("current_balance", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("original_balance", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("credit_limit", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("monthly_payment", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("payment_due_day", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("expected_end_date", sa.Date(), nullable=True),
        sa.Column("interest_rate", sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column("rate_type", sa.String(length=20), nullable=False, server_default="standard"),
        sa.Column("promotional_end_date", sa.Date(), nullable=True),
        sa.Column("standard_rate_after_promo", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_paid_off", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("paid_off_date", sa.Date(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.CheckConstraint(f"debt_type IN {DEBT_TYPES}", name="ck_debts_debt_type"),
        sa.CheckConstraint(f"rate_type IN {RATE_TYPES}", name="ck_debts_rate_type"),
        sa.CheckConstraint("payment_due_day BETWEEN 1 AND 31", name="ck_debts_payment_due_day"),
    )
    op.create_index("idx_debts_created_by", "debts", ["created_by"])
    op.create_index("idx_debts_active", "debts", ["active"])

    op.create_table(
        "debt_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("debt_id", sa.Integer(), sa.ForeignKey("debts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("recorded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_debt_payments_debt_id", "debt_payments", ["debt_id"])

    op.create_table(
        "debt_milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("debt_id", sa.Integer(), sa.ForeignKey("debts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("milestone_percent", sa.Integer(), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("milestone_percent IN (25, 50, 75, 100)", name="ck_debt_milestones_percent"),
        sa.UniqueConstraint("debt_id", "milestone_percent", name="uq_debt_milestones_debt_percent"),
    )
    op.create_index("idx_debt_milestones_debt_id", "debt_milestones", ["debt_id"])

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

    op.drop_index("idx_debt_milestones_debt_id", table_name="debt_milestones")
    op.drop_table("debt_milestones")

    op.drop_index("idx_debt_payments_debt_id", table_name="debt_payments")
    op.drop_table("debt_payments")

    op.drop_index("idx_debts_active", table_name="debts")
    op.drop_index("idx_debts_created_by", table_name="debts")
    op.drop_table("debts")
