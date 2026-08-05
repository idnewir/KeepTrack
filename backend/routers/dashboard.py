"""Dashboard endpoints: financial summary and login notifications."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from config import settings
from database import get_db
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
    _user: User = Depends(get_current_user),
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

    return notifications
