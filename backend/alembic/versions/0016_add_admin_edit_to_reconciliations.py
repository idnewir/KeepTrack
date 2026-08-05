"""add admin edit columns to monthly_reconciliations

Revision ID: b6c7d8e9f0a1
Revises: a4b5c6d7e8f9
Create Date: 2026-08-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6c7d8e9f0a1'
down_revision: Union[str, None] = 'a4b5c6d7e8f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('monthly_reconciliations', sa.Column('edited_by', sa.Integer(), nullable=True))
    op.add_column(
        'monthly_reconciliations', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('monthly_reconciliations', sa.Column('edit_reason', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_monthly_reconciliations_edited_by_users',
        'monthly_reconciliations',
        'users',
        ['edited_by'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_monthly_reconciliations_edited_by_users', 'monthly_reconciliations', type_='foreignkey'
    )
    op.drop_column('monthly_reconciliations', 'edit_reason')
    op.drop_column('monthly_reconciliations', 'edited_at')
    op.drop_column('monthly_reconciliations', 'edited_by')
