"""add project_id to invoices

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-08-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('project_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_invoices_project_id_planned_projects',
        'invoices',
        'planned_projects',
        ['project_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_invoices_project_id', 'invoices', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_invoices_project_id', table_name='invoices')
    op.drop_constraint('fk_invoices_project_id_planned_projects', 'invoices', type_='foreignkey')
    op.drop_column('invoices', 'project_id')
