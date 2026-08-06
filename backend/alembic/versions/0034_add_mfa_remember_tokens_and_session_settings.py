"""create mfa_remember_tokens table and add session timeout settings

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-08-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_SETTINGS = [
    {"key": "session_timeout_minutes", "value": "120"},
    {"key": "mfa_remember_hours", "value": "12"},
]


def upgrade() -> None:
    # Remember tokens are tracked in their own table (rather than as a JWT
    # claim) so an individual token can be looked up, revoked, and expired
    # independently of the stateless access-token JWTs — see
    # docs/decisions-log.md.
    op.create_table(
        'mfa_remember_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_mfa_remember_tokens_token_hash', 'mfa_remember_tokens', ['token_hash'], unique=False)
    op.create_index('ix_mfa_remember_tokens_user_id', 'mfa_remember_tokens', ['user_id'], unique=False)

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
    op.drop_index('ix_mfa_remember_tokens_user_id', table_name='mfa_remember_tokens')
    op.drop_index('ix_mfa_remember_tokens_token_hash', table_name='mfa_remember_tokens')
    op.drop_table('mfa_remember_tokens')
