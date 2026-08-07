"""Dashboard endpoints: financial summary and login notifications."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.audit_log import AuditLogArchive
from models.error_log import ErrorLog
from models.invoice import Invoice
from models.monthly_reconciliation import MonthlyReconciliation
from models.planned_project import PlannedProject
from models.schemas import DashboardNotification, DashboardSummary
from models.user import User
from services import date_service, financial_year_service as fy_service, notification_service
from services.settings_service import get_terminology, is_signing_enabled
from utils.deps import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _overdue_reconciliation_months(db: Session, today: date) -> list[date]:
    """Every calendar month from the app's effective start date up to (not
    including) the current month that has no MonthlyReconciliation row.
    Mirrors ReconciliationPage.jsx's own client-side overdue definition
    (a past, unreconciled month within the visible range) rather than
    re-deriving a second one server-side. See docs/decisions-log.md.
    """
    cursor = date_service.get_effective_start_date(db, today)
    cursor = date(cursor.year, cursor.month, 1)
    current_month_start = date(today.year, today.month, 1)
    reconciled_months = {
        row.month
        for row in db.query(MonthlyReconciliation.month)
        .filter(MonthlyReconciliation.month >= cursor, MonthlyReconciliation.month < current_month_start)
        .all()
    }
    overdue = []
    while cursor < current_month_start:
        if cursor not in reconciled_months:
            overdue.append(cursor)
        cursor = date(cursor.year + 1, 1, 1) if cursor.month == 12 else date(cursor.year, cursor.month + 1, 1)
    return overdue


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
    terminology = get_terminology(db)
    reserve_label_lower = summary["reserve_label"].lower()
    expenses_label_lower = terminology["term_expenses"].lower()
    expenses_label_singular_lower = _singularize(expenses_label_lower)
    projects_label_lower = terminology["term_projects"].lower()

    # Persistent notifications (services/notification_service.py) are created
    # here alongside these live banners, but computed independently of which
    # role is viewing the dashboard right now — "all Admins" needs notifying
    # even when a Standard user is the one whose page load triggers this
    # request. create_notification's dedup means calling this on every
    # dashboard load is safe: an already-live notification of the same type
    # is updated in place, not duplicated. See docs/decisions-log.md.
    if summary["balance_status"] == "below":
        message = (
            f"Current balance (£{summary['current_balance']:,.2f}) is below the "
            f"{reserve_label_lower} (£{summary['target_reserve']:,.2f})."
        )
        notifications.append({
            "id": "balance_below_target",
            "type": "balance_below_target",
            "severity": "urgent",
            "message": message,
            "link": "/",
        })
        notification_service.notify_admins(
            db,
            type="balance_warning",
            title=f"Balance below {reserve_label_lower}",
            message=message,
            link="/",
            severity="warning",
        )
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
        unsigned_query = db.query(Invoice).filter(
            Invoice.reviewed.is_(True),
            Invoice.signed.is_(False),
            Invoice.deleted.is_(False),
            Invoice.is_historical.is_(False),
        )
        unsigned_count = unsigned_query.count()
        if unsigned_count:
            noun = expenses_label_singular_lower if unsigned_count == 1 else expenses_label_lower
            message = f"{unsigned_count} confirmed {noun} still need signing."
            notifications.append({
                "id": "invoices_unsigned",
                "type": "invoice_unsigned",
                "severity": "warning",
                "message": message,
                "link": "/invoices?reviewed=true",
            })
            notification_service.notify_admins(
                db,
                type="unsigned_invoice",
                title=f"Confirmed {expenses_label_lower} need signing",
                message=message,
                link="/invoices?filter=unsigned",
                severity="info",
            )
            # Also notifies each uploader individually about their own
            # unsigned invoices — the brief's "for the invoice uploader"
            # target, distinct from the admin-wide aggregate above. If an
            # Admin is also an uploader, this per-uploader call runs after
            # notify_admins and (via create_notification's same-type dedup)
            # simply overwrites that Admin's own copy of the notification
            # with their personal count — an acceptable simplification since
            # both describe the same underlying condition. See
            # docs/decisions-log.md.
            uploader_counts = (
                unsigned_query.with_entities(Invoice.created_by, func.count(Invoice.id))
                .group_by(Invoice.created_by)
                .all()
            )
            for uploader_id, uploader_count in uploader_counts:
                uploader_noun = expenses_label_singular_lower if uploader_count == 1 else expenses_label_lower
                notification_service.create_notification(
                    db,
                    uploader_id,
                    type="unsigned_invoice",
                    title=f"Your {uploader_noun} need{'s' if uploader_count == 1 else ''} signing",
                    message=f"{uploader_count} {uploader_noun} you uploaded still need signing.",
                    link="/invoices?filter=unsigned",
                    severity="info",
                )

    overdue_months = _overdue_reconciliation_months(db, today)
    if overdue_months:
        month_count = len(overdue_months)
        noun = "month" if month_count == 1 else "months"
        message = f"{month_count} {noun} still not reconciled."
        notifications.append({
            "id": "reconciliation_overdue",
            "type": "reconciliation_overdue",
            "severity": "warning",
            "message": message,
            "link": "/reconciliation",
        })
        notification_service.notify_admins(
            db,
            type="reconciliation_overdue",
            title="Reconciliation overdue",
            message=message,
            link="/reconciliation",
            severity="warning",
        )

    stale_reconciliation_count = (
        db.query(MonthlyReconciliation).filter(MonthlyReconciliation.is_stale.is_(True)).count()
    )
    if stale_reconciliation_count:
        noun = "month" if stale_reconciliation_count == 1 else "months"
        message = (
            f"{stale_reconciliation_count} reconciled {noun} need review after later changes "
            "to their figures."
        )
        notifications.append({
            "id": "stale_reconciliation",
            "type": "stale_reconciliation",
            "severity": "warning",
            "message": message,
            "link": "/reconciliation",
        })
        notification_service.notify_admins(
            db,
            type="stale_reconciliation",
            title="Reconciliation needs review",
            message=message,
            link="/reconciliation",
            severity="warning",
        )

    current_month_start = date(today.year, today.month, 1)
    overdue_project_count = (
        db.query(PlannedProject)
        .filter(
            PlannedProject.active.is_(True),
            PlannedProject.completed.is_(False),
            PlannedProject.expected_month < current_month_start,
        )
        .count()
    )
    if overdue_project_count:
        noun = _singularize(projects_label_lower) if overdue_project_count == 1 else projects_label_lower
        message = f"{overdue_project_count} {noun} overdue."
        notifications.append({
            "id": "project_overdue",
            "type": "project_overdue",
            "severity": "warning",
            "message": message,
            "link": "/projects",
        })
        notification_service.notify_admins(
            db,
            type="project_overdue",
            title=f"{terminology['term_projects']} overdue",
            message=message,
            link="/projects",
            severity="warning",
        )

    # Computed unconditionally (not gated to the viewing user's role) so
    # Admins are still notified via the persistent notification centre even
    # when a Standard or Read Only user is the one whose dashboard load
    # triggers this request — only the live banner below stays role-gated,
    # since Standard/Read Only users can't reach Settings → Logs (the whole
    # /settings route is RequireAdmin-gated) and would hit a dead end.
    # See docs/decisions-log.md.
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
        message = (
            f"{critical_count} unresolved critical {noun} detected — please review the "
            "error log in Settings."
        )
        if user.role in ("admin", "superadmin"):
            notifications.append({
                "id": "critical_errors_detected",
                "type": "critical_errors_detected",
                "severity": "urgent",
                "message": message,
                "link": "/settings?section=logs&tab=errors",
            })
        notification_service.notify_admins(
            db,
            type="critical_error",
            title=f"Unresolved critical {noun}",
            message=message,
            link="/settings?section=logs&tab=errors",
            severity="error",
        )

    # "Send an Admin notification after completion" (quarterly archive) —
    # the live banner below is shown for 24 hours after the last archive run,
    # following this app's existing pattern of computing dashboard
    # notifications live rather than storing them (see the 2026-08-04 main
    # dashboard build entry) — reuses the archive event's own description
    # (already has the entry count and date) rather than recomputing it here.
    # Suppressed entirely when the run archived zero entries — a notification
    # with nothing to report is just dashboard noise; the run itself is still
    # recorded via the AuditLogArchive row regardless of count. The
    # persistent copy below has no such 24-hour window — it stays in the
    # notification centre until read or dismissed. See docs/decisions-log.md.
    last_archive_event = (
        db.query(AuditLogArchive)
        .filter(AuditLogArchive.action_type == "audit_log.archived")
        .order_by(AuditLogArchive.created_at.desc())
        .first()
    )
    entries_archived = (last_archive_event.extra_metadata or {}).get("entries_archived", 0) \
        if last_archive_event is not None else 0
    if last_archive_event is not None and entries_archived > 0:
        notification_service.notify_admins(
            db,
            type="audit_archived",
            title="Audit log archived",
            message=last_archive_event.description,
            link="/settings?section=logs",
            severity="info",
        )
        if user.role in ("admin", "superadmin"):
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
