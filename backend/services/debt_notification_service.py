"""Daily background check for promotional/0% debts whose rate is about to
revert to standard — notifies every Admin once per day per debt, so nobody
is surprised by a rate jump. Runs on a lightweight daemon thread (no
APScheduler/Celery in this codebase — see services/maintenance_service.py),
independent of the debt_tracking feature module's enabled state, matching
every other background job in this app: only UI/API access is gated by a
module, never the logic behind it. See docs/decisions-log.md.
"""
import logging
import threading
import time
from datetime import date, datetime, timezone

from database import SessionLocal
from models.debt import Debt
from models.notification import Notification
from services import notification_service
from services.settings_service import get_notification_preferences, get_notification_thresholds

logger = logging.getLogger("keep_track.debt_notifications")

CHECK_INTERVAL_SECONDS = 24 * 60 * 60


def _already_notified_today(db, debt_id: int) -> bool:
    notif_type = f"debt_promo_expiring_{debt_id}"
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(Notification)
        .filter(
            Notification.type == notif_type,
            Notification.created_at >= today_start,
        )
        .first()
        is not None
    )


def check_promo_expiries(today: date | None = None) -> int:
    """Notifies every Admin/Superadmin for each active debt whose
    promotional/0% rate ends within 30 days, once per debt per day (a repeat
    run today is a no-op — create_notification's own dedup would otherwise
    just keep refreshing the same still-unread row anyway, but checking here
    avoids bumping its created_at and re-surfacing it as "new"). Returns the
    number of debts notified for, for the caller to log/inspect."""
    today = today or date.today()
    db = SessionLocal()
    try:
        if not get_notification_preferences(db)["notif_promo_rate_expiring"]:
            return 0

        promo_warning_days = get_notification_thresholds(db)["notif_promo_rate_warning_days"]
        debts = (
            db.query(Debt)
            .filter(
                Debt.active.is_(True),
                Debt.is_paid_off.is_(False),
                Debt.rate_type.in_(("promotional", "zero")),
                Debt.promotional_end_date.isnot(None),
            )
            .all()
        )

        notified = 0
        for debt in debts:
            days_remaining = (debt.promotional_end_date - today).days
            if not (0 <= days_remaining <= promo_warning_days):
                continue
            if _already_notified_today(db, debt.id):
                continue

            standard_rate = debt.standard_rate_after_promo
            rate_text = f"{standard_rate}%" if standard_rate is not None else "the standard rate"
            notification_service.notify_admins(
                db,
                type=f"debt_promo_expiring_{debt.id}",
                title="Promotional rate expiring",
                message=(
                    f"Promotional rate on {debt.name} expires in {days_remaining} day"
                    f"{'s' if days_remaining != 1 else ''}. Standard rate of {rate_text} "
                    f"will apply from {debt.promotional_end_date.isoformat()}."
                ),
                link=f"/debts/{debt.id}",
                severity="warning",
            )
            notified += 1
        return notified
    finally:
        db.close()


def _promo_check_loop() -> None:
    while True:
        time.sleep(CHECK_INTERVAL_SECONDS)
        try:
            check_promo_expiries()
        except Exception:
            logger.exception("Debt promotional-rate expiry check failed")


def start_scheduler() -> None:
    """Starts the daily background thread. Does not run the check
    immediately — main.py calls check_promo_expiries() once at startup
    separately, so the two never race on the same first run (same pattern as
    services/maintenance_service.py's start_scheduler)."""
    thread = threading.Thread(target=_promo_check_loop, daemon=True)
    thread.start()
