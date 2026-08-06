"""add avatar and signature fields to users

Revision ID: a1b2c3d4e5f7
Revises: f5a6b7c8d9e0
Create Date: 2026-08-06 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # All nullable — most users will have none of these set and fall back to
    # a generated initials avatar / drawn signature. avatar_path (uploaded
    # picture) and avatar_url (external, e.g. Gravatar/DiceBear) are
    # mutually exclusive at the application layer, with avatar_url taking
    # precedence when both happen to be set — see docs/decisions-log.md.
    op.add_column('users', sa.Column('avatar_path', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(length=1000), nullable=True))
    op.add_column('users', sa.Column('signature_path', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'signature_path')
    op.drop_column('users', 'avatar_url')
    op.drop_column('users', 'avatar_path')
