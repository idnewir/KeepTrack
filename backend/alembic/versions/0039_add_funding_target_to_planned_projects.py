"""add funding target fields to planned_projects

Revision ID: ea9d466ba063
Revises: 8f37433201a6
Create Date: 2026-08-07 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea9d466ba063'
down_revision: Union[str, None] = '8f37433201a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('planned_projects', sa.Column('is_funding_target', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('planned_projects', sa.Column('funding_target_amount', sa.Numeric(12, 2), nullable=True))
    op.add_column('planned_projects', sa.Column('funding_target_date', sa.Date(), nullable=True))
    op.add_column('planned_projects', sa.Column('funding_notes', sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column('planned_projects', 'funding_notes')
    op.drop_column('planned_projects', 'funding_target_date')
    op.drop_column('planned_projects', 'funding_target_amount')
    op.drop_column('planned_projects', 'is_funding_target')
