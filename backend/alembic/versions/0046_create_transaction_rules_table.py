"""create transaction_rules table

Revision ID: 3b422c092397
Revises: 365be31a3b7d
Create Date: 2026-08-08 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b422c092397'
down_revision: Union[str, None] = '365be31a3b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MATCH_TYPES = ("exact", "contains", "starts_with")


def upgrade() -> None:
    op.create_table(
        "transaction_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("match_type", sa.String(length=20), nullable=False, server_default="contains"),
        sa.Column("match_value", sa.String(length=255), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.CheckConstraint(f"match_type IN {MATCH_TYPES}", name="ck_transaction_rules_match_type"),
    )
    op.create_index("ix_transaction_rules_priority", "transaction_rules", ["priority"])


def downgrade() -> None:
    op.drop_index("ix_transaction_rules_priority", table_name="transaction_rules")
    op.drop_table("transaction_rules")
