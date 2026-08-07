"""add folder integration settings, folder_watcher_log table, invoice import_source

Revision ID: 0012ffa339a9
Revises: fc25303f4d74
Create Date: 2026-08-07 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012ffa339a9'
down_revision: Union[str, None] = 'fc25303f4d74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FOLDER_WATCHER_LOG_STATUSES = (
    "detected", "processing", "completed", "skipped",
    "failed", "duplicate_flagged", "duplicate_overridden",
)

DEFAULT_SETTINGS = [
    {"key": "folder_input_enabled", "value": "false"},
    {"key": "folder_input_type", "value": "local"},
    {"key": "folder_input_path", "value": None},
    {"key": "folder_input_smb_server", "value": None},
    {"key": "folder_input_smb_share", "value": None},
    {"key": "folder_input_smb_username", "value": None},
    # Fernet-encrypted at rest — see utils/crypto.py and
    # services/folder_service.py. Stored as ciphertext, never plaintext.
    {"key": "folder_input_smb_password", "value": None},
    {"key": "folder_input_smb_guest", "value": "false"},
    {"key": "folder_input_poll_interval", "value": "60"},
    {"key": "folder_output_enabled", "value": "false"},
    {"key": "folder_output_type", "value": "local"},
    {"key": "folder_output_path", "value": None},
    {"key": "folder_output_smb_server", "value": None},
    {"key": "folder_output_smb_share", "value": None},
    {"key": "folder_output_smb_username", "value": None},
    {"key": "folder_output_smb_password", "value": None},
    {"key": "folder_output_smb_guest", "value": "false"},
    {"key": "folder_output_behaviour", "value": "both"},
]


def upgrade() -> None:
    settings_table = sa.table(
        "settings",
        sa.column("key", sa.String),
        sa.column("value", sa.String),
    )
    op.bulk_insert(settings_table, DEFAULT_SETTINGS)

    op.create_table(
        "folder_watcher_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=1000), nullable=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(f"status IN {FOLDER_WATCHER_LOG_STATUSES}", name="ck_folder_watcher_log_status"),
    )
    op.create_index("idx_folder_watcher_log_created_at", "folder_watcher_log", ["created_at"])
    op.create_index("idx_folder_watcher_log_filename", "folder_watcher_log", ["filename"])

    # Distinguishes a watched-folder auto-import from a manual upload or a
    # bulk CSV/PDF import (which already has import_batch_id for that
    # purpose) — needed by the review queue / invoice list to show where an
    # invoice came from. Nullable: every existing invoice predates this
    # column and simply has no recorded source. See docs/decisions-log.md.
    op.add_column("invoices", sa.Column("import_source", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "import_source")
    op.drop_index("idx_folder_watcher_log_filename", table_name="folder_watcher_log")
    op.drop_index("idx_folder_watcher_log_created_at", table_name="folder_watcher_log")
    op.drop_table("folder_watcher_log")

    settings_table = sa.table("settings", sa.column("key", sa.String))
    op.execute(
        settings_table.delete().where(
            settings_table.c.key.in_([row["key"] for row in DEFAULT_SETTINGS])
        )
    )
