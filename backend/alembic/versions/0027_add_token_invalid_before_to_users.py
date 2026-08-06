"""add token_invalid_before to users

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-08-06 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6d7e8f9a0b1'
down_revision: Union[str, None] = 'b5c6d7e8f9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Per-user session invalidation timestamp: stamped with "now" whenever a
    # password changes (self-service, forced, or an Admin's reset), so every
    # JWT issued before that moment is rejected immediately rather than
    # staying valid for up to its remaining 8-hour life. Security audit
    # finding — see docs/decisions-log.md and docs/security.md.
    op.add_column("users", sa.Column("token_invalid_before", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "token_invalid_before")
