"""add staleness tracking to monthly_reconciliations

Revision ID: e9f0a1b2c3d4
Revises: d7e8f9a0b1c2
Create Date: 2026-08-06 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'monthly_reconciliations',
        sa.Column('is_stale', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('monthly_reconciliations', sa.Column('stale_reason', sa.Text(), nullable=True))
    op.add_column(
        'monthly_reconciliations',
        sa.Column('stale_since', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_monthly_reconciliations_is_stale', 'monthly_reconciliations', ['is_stale'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_monthly_reconciliations_is_stale', table_name='monthly_reconciliations')
    op.drop_column('monthly_reconciliations', 'stale_since')
    op.drop_column('monthly_reconciliations', 'stale_reason')
    op.drop_column('monthly_reconciliations', 'is_stale')
