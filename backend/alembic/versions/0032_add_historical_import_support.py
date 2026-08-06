"""add historical import support

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-06 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('is_historical', sa.Boolean(), nullable=False, server_default='false'))
    # No FK to import_batches.batch_id — an invoice's import_batch_id is
    # purely a grouping label, and import batches (unlike invoices) are
    # meant to be freely deletable without touching every row that mentions
    # them (see DELETE /imports/{batch_id}, which can leave protected
    # invoices behind with their import_batch_id intact after the batch row
    # itself is gone).
    op.add_column('invoices', sa.Column('import_batch_id', sa.String(length=64), nullable=True))
    op.create_index('ix_invoices_import_batch_id', 'invoices', ['import_batch_id'])

    op.create_table(
        'import_batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('batch_id', sa.String(length=64), nullable=False),
        sa.Column('import_type', sa.String(length=10), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('total_records', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('imported_records', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_records', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('imported_by', sa.Integer(), nullable=False),
        sa.Column('imported_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['imported_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('batch_id'),
        sa.CheckConstraint("import_type IN ('pdf', 'csv')", name='ck_import_batches_import_type'),
        sa.CheckConstraint(
            "status IN ('processing', 'complete', 'partial', 'failed')",
            name='ck_import_batches_status',
        ),
    )


def downgrade() -> None:
    op.drop_table('import_batches')
    op.drop_index('ix_invoices_import_batch_id', table_name='invoices')
    op.drop_column('invoices', 'import_batch_id')
    op.drop_column('invoices', 'is_historical')
