"""create audit_log, audit_log_archive, error_log tables

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-05 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _audit_columns():
    return [
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=False),
        sa.Column('affected_table', sa.String(length=100), nullable=True),
        sa.Column('affected_record_id', sa.Integer(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    ]


def upgrade() -> None:
    # Active audit log — quarterly-archived, never purged outright (entries
    # move to audit_log_archive instead). See docs/decisions-log.md.
    op.create_table(
        'audit_log',
        *_audit_columns(),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_created_at', 'audit_log', ['created_at'], unique=False)
    op.create_index('ix_audit_log_user_id', 'audit_log', ['user_id'], unique=False)
    op.create_index('ix_audit_log_action_type', 'audit_log', ['action_type'], unique=False)

    # Permanent archive — identical structure, grows indefinitely, never purged.
    op.create_table(
        'audit_log_archive',
        *_audit_columns(),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_archive_created_at', 'audit_log_archive', ['created_at'], unique=False)
    op.create_index('ix_audit_log_archive_user_id', 'audit_log_archive', ['user_id'], unique=False)
    op.create_index('ix_audit_log_archive_action_type', 'audit_log_archive', ['action_type'], unique=False)

    # Rolling 90-day error log.
    op.create_table(
        'error_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('message', sa.String(length=1000), nullable=False),
        sa.Column('stack_trace', sa.Text(), nullable=True),
        sa.Column('request_path', sa.String(length=255), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("severity IN ('info', 'warning', 'error', 'critical')", name='ck_error_log_severity'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_error_log_created_at', 'error_log', ['created_at'], unique=False)
    op.create_index('ix_error_log_severity', 'error_log', ['severity'], unique=False)
    op.create_index('ix_error_log_source', 'error_log', ['source'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_error_log_source', table_name='error_log')
    op.drop_index('ix_error_log_severity', table_name='error_log')
    op.drop_index('ix_error_log_created_at', table_name='error_log')
    op.drop_table('error_log')

    op.drop_index('ix_audit_log_archive_action_type', table_name='audit_log_archive')
    op.drop_index('ix_audit_log_archive_user_id', table_name='audit_log_archive')
    op.drop_index('ix_audit_log_archive_created_at', table_name='audit_log_archive')
    op.drop_table('audit_log_archive')

    op.drop_index('ix_audit_log_action_type', table_name='audit_log')
    op.drop_index('ix_audit_log_user_id', table_name='audit_log')
    op.drop_index('ix_audit_log_created_at', table_name='audit_log')
    op.drop_table('audit_log')
