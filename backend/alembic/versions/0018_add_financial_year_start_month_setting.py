"""add financial_year_start_month setting

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-08-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Makes the financial year start month a runtime setting (Settings page +
    # setup wizard) instead of the hardcoded September in config.py. Value is
    # stored as a string "1"-"12". Defaults to 9 (September), matching the
    # existing KHOC-derived default. See docs/decisions-log.md.
    op.bulk_insert(
        sa.table(
            'settings',
            sa.column('key', sa.String),
            sa.column('value', sa.String),
        ),
        [{"key": "financial_year_start_month", "value": "9"}],
    )


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'financial_year_start_month'")
