"""add AI provider settings

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-08-05 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5c6d7e8f9a0'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_SETTINGS = [
    {"key": "ai_provider", "value": "anthropic"},
    {"key": "ai_model", "value": "claude-sonnet-4-6"},
    {"key": "ai_api_key", "value": None},
    {"key": "ai_endpoint_url", "value": None},
    {"key": "ai_enabled", "value": "true"},
]


def upgrade() -> None:
    # settings.value was VARCHAR(500) (migration 0007). An encrypted
    # (Fernet) ai_api_key ciphertext runs meaningfully longer than a raw API
    # key — some providers' keys already approach that limit unencrypted —
    # so this widens the column the same way migration 0002 widened
    # users.mfa_secret to make room for an encrypted value. Widening the
    # shared settings.value column affects every row, not just AI ones, but
    # there is no reason a wider column would break any existing setting.
    op.alter_column("settings", "value", type_=sa.String(2000), existing_type=sa.String(500))

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
    op.alter_column("settings", "value", type_=sa.String(500), existing_type=sa.String(2000))
