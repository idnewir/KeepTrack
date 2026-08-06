"""Dashboard endpoints: financial summary and login notifications."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.audit_log import AuditLogArchive
from models.error_log import ErrorLog
from models.invoice import Invoice
from models.schemas import DashboardNotification, DashboardSummary
from models.user import User
from services import financial_year_service as fy_service
from services.settings_service import get_terminology, is_signing_enabled
from utils.deps import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _singularize(word: str) -> str:
    """Best-effort singular of a configured plural term (e.g. "Invoices" ->
    "Invoice", "Bills" -> "Bill") for count-based notification text. Not
    linguistically perfect for every possible custom term, but the terms
    this app actually ships with (and their likely renames) are plain -s/-ies
    plurals. See docs/decisions-log.md."""
    if word.lower().endswith("ies"):
        return word[:-3] + "y"
    if word.lower().endswith("s") and not word.lower().endswith("ss"):
        return word[:-1]
    return word


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return fy_service.build_summary(db, date.today())


@router.get("/notifications", response_model=list[DashboardNotification])
def get_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    summary = fy_service.build_summary(db, today)
    notifications: list[dict] = []

    # Uses the org's own configured terms (e.g. "Rainy Day Fund" instead of
    # the default "Target Reserve", "Bills" instead of "Invoices") so these
    # notification banners speak the same vocabulary as the rest of the app.
    # See docs/decisions-log.md.
    reserve_label_lower = summary["reserve_label"].lower()
    expenses_label_lower = get_terminology(db)["term_expenses"].lower()
    expenses_label_singular_lower = _singularize(expenses_label_lower)

    if summary["balance_status"] == "below":
        notifications.append({
            "id": "balance_below_target",
            "type": "balance_below_target",
            "severity": "urgent",
            "message": (
                f"Current balance (£{summary['current_balance']:,.2f}) is below the "
                f"{reserve_label_lower} (£{summary['target_reserve']:,.2f})."
            ),
            "link": "/",
        })
    elif summary["balance_status"] == "near":
        notifications.append({
            "id": "balance_near_target",
            "type": "balance_below_target",
            "severity": "warning",
            "message": (
                f"Current balance (£{summary['current_balance']:,.2f}) is within 10% of the "
                f"{reserve_label_lower} (£{summary['target_reserve']:,.2f}) — worth keeping an eye on."
            ),
            "link": "/",
        })

    # Configurable via UNCONFIRMED_INVOICE_ALERT_DAYS (config.py) rather than a
    # fixed number — matches docs/features.md's "configurable number of days"
    # notification threshold. See docs/decisions-log.md.
    threshold_days = settings.unconfirmed_invoice_alert_days
    cutoff = datetime.now(timezone.utc) - timedelta(days=threshold_days)
    stale_count = (
        db.query(Invoice)
        .filter(
            Invoice.reviewed.is_(False),
            Invoice.deleted.is_(False),
            Invoice.upload_date <= cutoff,
        )
        .count()
    )
    if stale_count:
        noun = expenses_label_singular_lower if stale_count == 1 else expenses_label_lower
        notifications.append({
            "id": "invoices_unreviewed",
            "type": "invoice_unconfirmed",
            "severity": "warning",
            "message": (
                f"{stale_count} {noun} still waiting for review after more than "
                f"{threshold_days} days."
            ),
            "link": "/invoices?reviewed=false",
        })

    if is_signing_enabled(db):
        unsigned_count = (
            db.query(Invoice)
            .filter(
                Invoice.reviewed.is_(True),
                Invoice.signed.is_(False),
                Invoice.deleted.is_(False),
                Invoice.is_historical.is_(False),
            )
            .count()
        )
        if unsigned_count:
            noun = expenses_label_singular_lower if unsigned_count == 1 else expenses_label_lower
            notifications.append({
                "id": "invoices_unsigned",
                "type": "invoice_unsigned",
                "severity": "warning",
                "message": f"{unsigned_count} confirmed {noun} still need signing.",
                "link": "/invoices?reviewed=true",
            })

    # Reconciliation overdue: intentionally not generated yet — the
    # monthly_reconciliations table/feature hasn't been built (see
    # docs/decisions-log.md). This is the placeholder for it. Whoever builds
    # it should scope the overdue check to months >= date_service
    # .get_effective_start_date(db), the same way ReconciliationPage's own
    # client-side overdue list already only considers visible months.

    # The two notifications below are Admin/Superadmin-only — Standard and
    # Read Only users can't reach Settings → Logs (the whole /settings route
    # is RequireAdmin-gated), so surfacing these to them would just be a
    # dead-end banner. See docs/decisions-log.md.
    if user.role in ("admin", "superadmin"):
        critical_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        critical_count = (
            db.query(ErrorLog)
            .filter(
                ErrorLog.severity == "critical",
                ErrorLog.resolved.is_(False),
                ErrorLog.created_at >= critical_cutoff,
            )
            .count()
        )
        if critical_count:
            noun = "error" if critical_count == 1 else "errors"
            notifications.append({
                "id": "critical_errors_detected",
                "type": "critical_errors_detected",
                "severity": "urgent",
                "message": (
                    f"{critical_count} unresolved critical {noun} detected — please review the "
                    "error log in Settings."
                ),
                "link": "/settings?section=logs&tab=errors",
            })

        # "Send an Admin notification after completion" (quarterly archive) —
        # implemented as a live dashboard notification shown for 24 hours
        # after the last archive run, following this app's existing pattern
        # of computing dashboard notifications live rather than storing them
        # (see the 2026-08-04 main dashboard build entry). Reuses the archive
        # event's own description (already has the entry count and date)
        # rather than recomputing it here. Suppressed entirely when the run
        # archived zero entries — a notification with nothing to report is
        # just dashboard noise; the run itself is still recorded via the
        # AuditLogArchive row regardless of count. See docs/decisions-log.md.
        last_archive_event = (
            db.query(AuditLogArchive)
            .filter(AuditLogArchive.action_type == "audit_log.archived")
            .order_by(AuditLogArchive.created_at.desc())
            .first()
        )
        entries_archived = (last_archive_event.extra_metadata or {}).get("entries_archived", 0) \
            if last_archive_event is not None else 0
        if last_archive_event is not None and entries_archived > 0:
            archive_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            event_created_at = last_archive_event.created_at
            if event_created_at.tzinfo is None:
                event_created_at = event_created_at.replace(tzinfo=timezone.utc)
            if event_created_at >= archive_cutoff:
                notifications.append({
                    "id": "audit_log_archived",
                    "type": "audit_log_archived",
                    "severity": "warning",
                    "message": last_archive_event.description,
                    "link": "/settings?section=logs",
                })

    return notifications
