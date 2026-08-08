"""widen user-referencing FK columns to nullable, for GDPR permanent delete

Permanently deleting a user (DELETE /auth/users/{id}) anonymises every
financial record it created rather than deleting the record itself — see
docs/decisions-log.md. That requires every users.id foreign key on a
financial-record table to accept NULL; most of them were originally
NOT NULL ("every invoice/contribution/etc. must have been created by
someone"), which was true until permanent deletion existed.

Revision ID: cb4ff01312dd
Revises: 8ce19457f7da
Create Date: 2026-08-08 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'cb4ff01312dd'
down_revision: Union[str, None] = '8ce19457f7da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column) pairs whose users.id FK is widened from NOT NULL to
# nullable. Columns that were already nullable (audit_log.user_id,
# error_log.user_id/resolved_by, monthly_reconciliations.edited_by,
# planned_projects.edited_by, settings.updated_by, system_events
# .performed_by) need no schema change — GDPR deletion nulls them directly.
TABLE_COLUMNS = [
    ("invoices", "created_by"),
    ("contributions", "recorded_by"),
    ("monthly_reconciliations", "reconciled_by"),
    ("planned_projects", "created_by"),
    ("reports", "generated_by"),
    ("debts", "created_by"),
    ("debt_payments", "recorded_by"),
    ("category_budgets", "created_by"),
    ("savings_goals", "created_by"),
    ("import_batches", "imported_by"),
]


def upgrade() -> None:
    for table, column in TABLE_COLUMNS:
        op.alter_column(table, column, nullable=True)


def downgrade() -> None:
    # Not reversible in general — a downgrade run after any user has
    # actually been permanently deleted would fail on rows that are now
    # legitimately NULL. Left as a straight column-nullability revert for
    # the common case (no deletions performed yet), matching this
    # migration's own narrow scope.
    for table, column in TABLE_COLUMNS:
        op.alter_column(table, column, nullable=False)
