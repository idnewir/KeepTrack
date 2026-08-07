"""create feature_modules table

Revision ID: 8f37433201a6
Revises: c3d4e5f6a7b9
Create Date: 2026-08-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f37433201a6'
down_revision: Union[str, None] = 'c3d4e5f6a7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (module_key, enabled, label, description, requires_setup) — seeded once,
# on table creation, so a fresh install already has every module in its
# documented default state rather than the app having to backfill rows the
# first time each is looked up. See docs/decisions-log.md.
SEED_MODULES = [
    ("reconciliation", True, "Reconciliation", "Monthly bank reconciliation against actual balance", False),
    ("planned_projects", True, "Planned Projects", "Track future planned spend and link to invoices", False),
    ("signing_export", True, "Signing & Export", "Sign invoices and export signed PDFs", False),
    ("ai_extraction", True, "AI Extraction", "AI-powered automatic invoice data extraction", True),
    ("bulk_import", True, "Bulk Import", "Import historical invoices via CSV or PDF", False),
    ("full_text_search", True, "Full Text Search", "Search across all invoices, projects and contributions", False),
    (
        "folder_integration",
        False,
        "Folder Integration",
        "Auto-import invoices from a watched folder and auto-export signed PDFs to an output folder",
        True,
    ),
    ("debt_tracking", False, "Debt Tracking", "Track loans, credit cards, mortgages and other debts", True),
    ("budget_planning", False, "Budget Planning", "Set monthly budgets and allocate income across categories", True),
]


def upgrade() -> None:
    op.create_table(
        'feature_modules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('module_key', sa.String(length=50), nullable=False, unique=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=False),
        sa.Column('default_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('requires_setup', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_feature_modules_module_key', 'feature_modules', ['module_key'], unique=True)

    table = sa.table(
        'feature_modules',
        sa.column('module_key', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('label', sa.String),
        sa.column('description', sa.String),
        sa.column('default_enabled', sa.Boolean),
        sa.column('requires_setup', sa.Boolean),
    )
    op.bulk_insert(
        table,
        [
            {
                "module_key": key,
                "enabled": enabled,
                "label": label,
                "description": description,
                "default_enabled": enabled,
                "requires_setup": requires_setup,
            }
            for key, enabled, label, description, requires_setup in SEED_MODULES
        ],
    )


def downgrade() -> None:
    op.drop_index('idx_feature_modules_module_key', table_name='feature_modules')
    op.drop_table('feature_modules')
