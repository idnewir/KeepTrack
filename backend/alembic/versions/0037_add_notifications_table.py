"""add notifications table

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-08-07 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b9'
down_revision: Union[str, None] = 'b2c3d4e5f6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.String(length=1000), nullable=False),
        sa.Column('link', sa.String(length=500), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=False, server_default='info'),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dismissed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("severity IN ('info', 'warning', 'error', 'critical')", name='ck_notifications_severity'),
    )
    # Every read of this table is "this user's notifications, newest first"
    # (GET /notifications) or "this user's unread count" (GET
    # /notifications/count, polled every 30s) — both filter on user_id first.
    op.create_index('idx_notifications_user_id', 'notifications', ['user_id'])
    # The dedup lookup in services/notification_service.py (same user + type,
    # still unread/undismissed) is the other hot path this index covers.
    op.create_index('idx_notifications_user_type', 'notifications', ['user_id', 'type'])


def downgrade() -> None:
    op.drop_index('idx_notifications_user_type', table_name='notifications')
    op.drop_index('idx_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')
