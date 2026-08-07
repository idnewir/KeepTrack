"""add avatar_source to users

Revision ID: fc25303f4d74
Revises: ea9d466ba063
Create Date: 2026-08-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fc25303f4d74'
down_revision: Union[str, None] = 'ea9d466ba063'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tracks whether the file at avatar_path came from an upload or a
    # Gravatar fetch — needed because both can produce an identically-named
    # avatar.png, so the file itself can't tell the two apart. Nullable:
    # existing uploaded avatars predate this column and are simply treated
    # as "not Gravatar-sourced" (no Refresh button shown). See
    # docs/decisions-log.md.
    op.add_column('users', sa.Column('avatar_source', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_source')
