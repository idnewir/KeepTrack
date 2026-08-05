"""add app_start_date setting

Revision ID: a4b5c6d7e8f9
Revises: e5f6a7b8c9d0
Create Date: 2026-08-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4b5c6d7e8f9'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # settings.value was NOT NULL (migration 0007) — app_start_date's "not
    # set" state is a real NULL, not a sentinel string, so every other
    # setting stays NOT NULL in practice while the column itself now allows
    # a row to opt out of having a value. See docs/decisions-log.md.
    op.alter_column('settings', 'value', existing_type=sa.String(length=500), nullable=True)

    op.bulk_insert(
        sa.table(
            'settings',
            sa.column('key', sa.String),
            sa.column('value', sa.String),
        ),
        [{"key": "app_start_date", "value": None}],
    )


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'app_start_date'")
    op.alter_column('settings', 'value', existing_type=sa.String(length=500), nullable=False)
