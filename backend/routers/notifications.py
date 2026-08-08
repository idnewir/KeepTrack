"""Header notification centre endpoints — the persistent counterpart to
routers/dashboard.py's live-computed banners. See docs/decisions-log.md.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from models.schemas import NotificationCountOut, NotificationListOut, NotificationOut, PaginatedResponse
from models.user import User
from services import modules_service
from utils.csv_export import csv_response
from utils.deps import get_current_user, require_admin
from utils.pagination import paginate

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Settings -> Notifications & Logs -> Notifications -> Notification history
# shows a fixed 30-day window, matching the error log's own fixed
# retention window rather than being a user-chosen filter — see
# docs/decisions-log.md.
HISTORY_WINDOW_DAYS = 30


def _history_query(db: Session):
    cutoff = datetime.now(timezone.utc) - timedelta(days=HISTORY_WINDOW_DAYS)
    return db.query(Notification).filter(Notification.created_at >= cutoff).order_by(Notification.created_at.desc())


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


@router.get("/history", response_model=PaginatedResponse[NotificationOut])
def notification_history(
    page: int = 1,
    per_page: int = 25,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Every notification (any user, read/unread, dismissed or not) from
    the last 30 days — a site-wide audit view for Settings -> Notifications
    & Logs, the same shape as the Audit/Error log tables elsewhere on that
    page, rather than "my own notifications" (which the header bell/GET
    /notifications above already covers). See docs/decisions-log.md."""
    items, pagination = paginate(_history_query(db), page, per_page)
    return {"data": items, "pagination": pagination}


@router.get("/history/export/csv")
def export_notification_history_csv(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = _history_query(db).all()
    csv_rows = [
        [
            n.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            n.type,
            n.severity,
            n.message,
            "Yes" if n.read else "No",
            "Yes" if n.dismissed else "No",
        ]
        for n in rows
    ]
    return csv_response(
        "notification_history.csv",
        ["Date", "Type", "Severity", "Message", "Read", "Dismissed"],
        csv_rows,
    )


@router.get("/count", response_model=NotificationCountOut)
def count_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Also carries the current feature-module state — ModulesContext polls
    this endpoint every 30s (rather than a separate one of its own) so module
    toggles made in another tab/session propagate on the same cadence the
    header notification bell already polls at. See docs/decisions-log.md."""
    unread_count = (
        _not_expired(db.query(Notification))
        .filter(Notification.user_id == user.id, Notification.read.is_(False), Notification.dismissed.is_(False))
        .count()
    )
    return {"unread_count": unread_count, "modules": modules_service.modules_state(db)}


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
