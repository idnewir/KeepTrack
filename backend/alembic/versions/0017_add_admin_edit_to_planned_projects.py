"""add admin edit columns to planned_projects

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-08-05 14:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = 'b6c7d8e9f0a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('planned_projects', sa.Column('edited_by', sa.Integer(), nullable=True))
    op.add_column('planned_projects', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('planned_projects', sa.Column('edit_reason', sa.Text(), nullable=True))
    op.add_column('planned_projects', sa.Column('admin_edit_notes', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_planned_projects_edited_by_users',
        'planned_projects',
        'users',
        ['edited_by'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_planned_projects_edited_by_users', 'planned_projects', type_='foreignkey')
    op.drop_column('planned_projects', 'admin_edit_notes')
    op.drop_column('planned_projects', 'edit_reason')
    op.drop_column('planned_projects', 'edited_at')
    op.drop_column('planned_projects', 'edited_by')
