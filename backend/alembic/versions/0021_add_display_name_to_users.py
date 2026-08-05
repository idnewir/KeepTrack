"""add display_name to users

Revision ID: a1b2c3d4e5f6
Revises: f0a1b2c3d4e5
Create Date: 2026-08-05 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: existing users have no display name yet, and the frontend
    # falls back to username wherever one isn't set. See docs/decisions-log.md.
    op.add_column('users', sa.Column('display_name', sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'display_name')
