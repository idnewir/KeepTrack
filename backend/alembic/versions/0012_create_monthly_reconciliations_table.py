"""create monthly_reconciliations table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-04 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'monthly_reconciliations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('financial_year_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Date(), nullable=False),
        sa.Column('calculated_balance', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('actual_balance', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('discrepancy', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('discrepancy_notes', sa.Text(), nullable=True),
        sa.Column('suggested_reason', sa.Text(), nullable=True),
        sa.Column('reconciled_by', sa.Integer(), nullable=False),
        sa.Column('reconciled_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['financial_year_id'], ['financial_years.id']),
        sa.ForeignKeyConstraint(['reconciled_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('financial_year_id', 'month', name='uq_monthly_reconciliations_fy_month'),
    )
    op.create_index(
        'ix_monthly_reconciliations_fy_month',
        'monthly_reconciliations',
        ['financial_year_id', 'month'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_monthly_reconciliations_fy_month', table_name='monthly_reconciliations')
    op.drop_table('monthly_reconciliations')
