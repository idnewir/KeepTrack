"""add notification threshold and preference settings

Seeds the settings rows behind Settings -> Notifications & Logs ->
Notifications: four numeric thresholds controlling when a notification
condition is considered true, and ten on/off preferences controlling
whether that notification is actually created once it is. See
services/settings_service.py and docs/decisions-log.md.

Revision ID: 365be31a3b7d
Revises: cb4ff01312dd
Create Date: 2026-08-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '365be31a3b7d'
down_revision: Union[str, None] = 'cb4ff01312dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Kept in one flat list (rather than two) purely because op.bulk_insert
# wants one homogeneous set of rows — services/settings_service.py's own
# NOTIF_THRESHOLD_DEFAULTS/NOTIF_PREFERENCE_DEFAULTS keep the functional
# distinction (int vs bool) that matters at read time.
DEFAULT_SETTINGS = [
    {"key": "notif_reconciliation_overdue_days", "value": "30"},
    {"key": "notif_promo_rate_warning_days", "value": "30"},
    {"key": "notif_unconfirmed_invoice_days", "value": "3"},
    {"key": "notif_budget_warning_percent", "value": "80"},
    {"key": "notif_balance_warning", "value": "true"},
    {"key": "notif_unsigned_invoice", "value": "true"},
    {"key": "notif_stale_reconciliation", "value": "true"},
    {"key": "notif_reconciliation_overdue", "value": "true"},
    {"key": "notif_critical_error", "value": "true"},
    {"key": "notif_project_overdue", "value": "true"},
    {"key": "notif_promo_rate_expiring", "value": "true"},
    {"key": "notif_budget_warning", "value": "true"},
    {"key": "notif_budget_over", "value": "true"},
    {"key": "notif_debt_milestone", "value": "true"},
]


def upgrade() -> None:
    settings_table = sa.table(
        "settings",
        sa.column("key", sa.String),
        sa.column("value", sa.String),
    )
    op.bulk_insert(settings_table, DEFAULT_SETTINGS)


def downgrade() -> None:
    settings_table = sa.table("settings", sa.column("key", sa.String))
    op.execute(
        settings_table.delete().where(
            settings_table.c.key.in_([row["key"] for row in DEFAULT_SETTINGS])
        )
    )
