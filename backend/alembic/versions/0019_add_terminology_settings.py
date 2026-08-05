"""add terminology settings

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-08-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9f0a1b2c3d4'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Makes the "Invoices"/"Contributions"/"Projects"/"Reconciliation"/
    # "Target Reserve" labels shown throughout the app configurable, so a
    # non-charity user can rename them (e.g. "Bills", "Income"). site_name
    # already exists (migration 0014) and is left untouched here. See
    # docs/decisions-log.md.
    op.bulk_insert(
        sa.table(
            'settings',
            sa.column('key', sa.String),
            sa.column('value', sa.String),
        ),
        [
            {"key": "term_expenses", "value": "Invoices"},
            {"key": "term_income", "value": "Contributions"},
            {"key": "term_projects", "value": "Projects"},
            {"key": "term_reconciliation", "value": "Reconciliation"},
            {"key": "term_reserve", "value": "Target Reserve"},
        ],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM settings WHERE key IN "
        "('term_expenses', 'term_income', 'term_projects', 'term_reconciliation', 'term_reserve')"
    )
