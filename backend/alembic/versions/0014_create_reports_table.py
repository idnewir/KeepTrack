"""create reports table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-04 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Reports need an organisation/site name for the PDF cover page and the AI
# prompt's context (see docs/decisions-log.md) — no such setting existed
# before this feature. Seeded here, alongside the table this feature adds,
# rather than a separate migration; editable afterwards like any other
# setting via the existing PUT /settings/{key}, so no new endpoint is needed.
SEEDED_SETTINGS = [
    {"key": "site_name", "value": "Keep Track"},
]


def upgrade() -> None:
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('generated_by', sa.Integer(), nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('date_from', sa.Date(), nullable=False),
        sa.Column('date_to', sa.Date(), nullable=False),
        sa.Column('categories_included', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('years_included', sa.Integer(), server_default='3', nullable=False),
        sa.Column('report_type', sa.String(length=20), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('parameters', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('deleted', sa.Boolean(), server_default='false', nullable=False),
        sa.CheckConstraint("report_type IN ('historical', 'forecast', 'combined')", name='ck_reports_report_type'),
        sa.ForeignKeyConstraint(['generated_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_reports_generated_at', 'reports', ['generated_at'], unique=False)

    settings_table = sa.table('settings', sa.column('key', sa.String), sa.column('value', sa.String))
    op.bulk_insert(settings_table, SEEDED_SETTINGS)


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'site_name'")
    op.drop_index('ix_reports_generated_at', table_name='reports')
    op.drop_table('reports')
