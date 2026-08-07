"""Header notification centre endpoints — the persistent counterpart to
routers/dashboard.py's live-computed banners. See docs/decisions-log.md.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from models.schemas import NotificationCountOut, NotificationListOut, NotificationOut
from models.user import User
from utils.deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _not_expired(query):
    now = datetime.now(timezone.utc)
    return query.filter(or_(Notification.expires_at.is_(None), Notification.expires_at > now))


def _own_notification(db: Session, notification_id: int, user: User) -> Notification:
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if notification is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    return notification


@router.get("", response_model=NotificationListOut)
def list_notifications(
    read: str = Query("all", pattern="^(all|unread|read)$"),
    dismissed: str = Query("false", pattern="^(false|true|all)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = _not_expired(db.query(Notification)).filter(Notification.user_id == user.id)
    if read == "unread":
        query = query.filter(Notification.read.is_(False))
    elif read == "read":
        query = query.filter(Notification.read.is_(True))
    if dismissed == "false":
        query = query.filter(Notification.dismissed.is_(False))
    elif dismissed == "true":
        query = query.filter(Notification.dismissed.is_(True))

    notifications = query.order_by(Notification.created_at.desc()).all()
    unread_count = (
        _not_expired(db.query(Notification))
        .filter(Notification.user_id == user.id, Notification.read.is_(False), Notification.dismissed.is_(False))
        .count()
    )
    return {"notifications": notifications, "unread_count": unread_count}


@router.get("/count", response_model=NotificationCountOut)
def count_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    unread_count = (
        _not_expired(db.query(Notification))
        .filter(Notification.user_id == user.id, Notification.read.is_(False), Notification.dismissed.is_(False))
        .count()
    )
    return {"unread_count": unread_count}


@router.put("/read-all", response_model=NotificationCountOut)
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read.is_(False)).update(
        {"read": True}, synchronize_session=False
    )
    db.commit()
    return {"unread_count": 0}


@router.put("/dismiss-all", response_model=NotificationCountOut)
def dismiss_all(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.dismissed.is_(False)).update(
        {"dismissed": True}, synchronize_session=False
    )
    db.commit()
    return {"unread_count": 0}


@router.put("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    notification = _own_notification(db, notification_id, user)
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.put("/{notification_id}/dismiss", response_model=NotificationOut)
def dismiss(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    notification = _own_notification(db, notification_id, user)
    notification.dismissed = True
    db.commit()
    db.refresh(notification)
    return notification
