"""Persistent, per-user notification centre — services/notification_service.py
is the single place anything in the app writes a `notifications` row, so the
dedup rule below applies no matter which caller triggers it. See
docs/decisions-log.md.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from models.notification import Notification
from models.user import User


def create_notification(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    message: str,
    link: str | None = None,
    severity: str = "info",
    expires_at: datetime | None = None,
) -> Notification:
    """Creates a notification for one user, or updates its existing
    still-live copy instead of creating a duplicate.

    "Still live" means unread or undismissed — once a user has read or
    dismissed a notification of this type, a fresh occurrence (e.g. the
    balance dropping below target again next month) is a new, separate row
    rather than silently reviving the old one, which the user has already
    dealt with.
    """
    existing = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == type,
            Notification.read.is_(False),
            Notification.dismissed.is_(False),
        )
        .first()
    )
    if existing is not None:
        existing.title = title
        existing.message = message
        existing.link = link
        existing.severity = severity
        existing.expires_at = expires_at
        db.commit()
        db.refresh(existing)
        return existing

    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        link=link,
        severity=severity,
        expires_at=expires_at,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def notify_admins(
    db: Session,
    type: str,
    title: str,
    message: str,
    link: str | None = None,
    severity: str = "info",
    expires_at: datetime | None = None,
) -> None:
    """create_notification for every Admin and Superadmin — the recipient
    set every notification type in this task's brief except the unsigned-
    invoice one (which also includes the uploader) targets. See
    docs/decisions-log.md.
    """
    admin_ids = [
        row.id
        for row in db.query(User.id).filter(User.role.in_(("admin", "superadmin"))).all()
    ]
    for admin_id in admin_ids:
        create_notification(db, admin_id, type, title, message, link=link, severity=severity, expires_at=expires_at)
