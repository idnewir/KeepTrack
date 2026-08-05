"""add target reserve settings

Revision ID: f0a1b2c3d4e5
Revises: e9f0a1b2c3d4
Create Date: 2026-08-05 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, None] = 'e9f0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Makes the target reserve calculation configurable (automatic — a
    # rolling monthly average times a configurable number of months — or a
    # fixed manual amount) instead of the hardcoded 3-month rolling average.
    # reserve_manual_amount is seeded NULL (settings.value is nullable since
    # migration 0015) since automatic is the default calculation method.
    # See docs/decisions-log.md.
    op.bulk_insert(
        sa.table(
            'settings',
            sa.column('key', sa.String),
            sa.column('value', sa.String),
        ),
        [
            {"key": "reserve_calculation", "value": "automatic"},
            {"key": "reserve_months", "value": "3"},
            {"key": "reserve_manual_amount", "value": None},
        ],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM settings WHERE key IN "
        "('reserve_calculation', 'reserve_months', 'reserve_manual_amount')"
    )
