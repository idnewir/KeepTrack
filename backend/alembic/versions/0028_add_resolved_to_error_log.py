"""add resolved tracking to error_log

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-08-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e8f9a0b1c2'
down_revision: Union[str, None] = 'c6d7e8f9a0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'error_log',
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('error_log', sa.Column('resolved_by', sa.Integer(), nullable=True))
    op.add_column('error_log', sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('error_log', sa.Column('resolved_note', sa.String(length=500), nullable=True))
    op.create_foreign_key(
        'fk_error_log_resolved_by_users', 'error_log', 'users', ['resolved_by'], ['id'],
    )
    op.create_index('ix_error_log_resolved', 'error_log', ['resolved'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_error_log_resolved', table_name='error_log')
    op.drop_constraint('fk_error_log_resolved_by_users', 'error_log', type_='foreignkey')
    op.drop_column('error_log', 'resolved_note')
    op.drop_column('error_log', 'resolved_at')
    op.drop_column('error_log', 'resolved_by')
    op.drop_column('error_log', 'resolved')
