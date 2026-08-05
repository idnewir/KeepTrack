"""add storage and backup settings

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-05 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# storage_path defaults to "/data" rather than the "/app/storage" named in
# this feature's task brief — "/data" is the parent of the invoice_storage
# and report_storage Docker volumes already mounted at /data/invoices and
# /data/reports (see docker-compose.yml), so every original/signed/report
# path this migration's default produces lines up exactly with files
# written by earlier builds. An unmounted /app/storage path would not
# persist across container restarts, same reasoning as every earlier
# storage-path deviation recorded in docs/decisions-log.md.
DEFAULT_SETTINGS = [
    {"key": "storage_path", "value": "/data"},
    {"key": "backup_path", "value": None},
    {"key": "backup_schedule", "value": "manual"},
    {"key": "backup_retention_count", "value": "5"},
    {"key": "last_backup_date", "value": None},
    {"key": "last_backup_size", "value": None},
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
