"""System reset — wipes all app data and restores Keep Track to its
first-run state. Superadmin-only, protected by a confirmation phrase, the
Superadmin's own password, and a rate limit — see routers/system.py, which
owns the actual authorisation/verification checks and calls straight into
perform_reset() once they pass.
"""
import os
import shutil
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings as app_config
from models.category import Category
from models.contribution import Contribution
from models.financial_year import FinancialYear
from models.invoice import Invoice
from models.invoice_file import InvoiceFile
from models.monthly_reconciliation import MonthlyReconciliation
from models.planned_project import PlannedProject
from models.report import Report
from models.setting import Setting
from models.system_event import SystemEvent
from models.user import User

RESET_CONFIRMATION_PHRASE = "RESET KEEP TRACK"
RATE_LIMIT_MAX_ATTEMPTS = 3
RATE_LIMIT_WINDOW_HOURS = 1

# Event types that count towards the rate limit — an actual credential check
# was made. A rate-limited attempt itself is logged under a different type
# (see log_reset_event's caller in routers/system.py) so hammering the
# endpoint while already locked out can't keep extending the lockout window.
_RATE_LIMITED_EVENT_TYPES = ("system_reset_success", "system_reset_failed")

# Mirrors the categories seeded by migration 0003_create_categories_table.py —
# duplicated here (not imported from the migration) since a runtime reseed
# and a one-off migration seed are different operations that happen to want
# the same starting data, matching the precedent already set by
# services/settings_service.py's own TERMINOLOGY_DEFAULTS.
DEFAULT_CATEGORIES = [
    {"name": "Electricity", "colour": "#378ADD", "active": True},
    {"name": "Water", "colour": "#1D9E75", "active": True},
    {"name": "Broadband", "colour": "#9B59B6", "active": True},
    {"name": "HVAC", "colour": "#E67E22", "active": True},
    {"name": "Alarm", "colour": "#E74C3C", "active": True},
    {"name": "Supplies", "colour": "#F39C12", "active": True},
    {"name": "General Maintenance", "colour": "#95A5A6", "active": True},
]

# Mirrors every settings row seeded across migrations 0007, 0014, 0015, 0018,
# 0019, and 0020 — the full set of "first run" defaults a fresh install
# would have. Same duplication rationale as DEFAULT_CATEGORIES above.
DEFAULT_SETTINGS = [
    {"key": "signing_enabled", "value": "true"},
    {"key": "site_name", "value": "Keep Track"},
    {"key": "app_start_date", "value": None},
    {"key": "financial_year_start_month", "value": "9"},
    {"key": "term_expenses", "value": "Invoices"},
    {"key": "term_income", "value": "Contributions"},
    {"key": "term_projects", "value": "Projects"},
    {"key": "term_reconciliation", "value": "Reconciliation"},
    {"key": "term_reserve", "value": "Target Reserve"},
    {"key": "reserve_calculation", "value": "automatic"},
    {"key": "reserve_months", "value": "3"},
    {"key": "reserve_manual_amount", "value": None},
]


def log_reset_event(db: Session, event_type: str, performed_by: int, details: dict) -> None:
    """Writes one row and commits immediately, independent of whatever the
    caller does next — an attempt (successful or not) must survive even if
    the reset itself later fails partway through. See docs/decisions-log.md."""
    db.add(SystemEvent(event_type=event_type, performed_by=performed_by, details=details))
    db.commit()


def recent_attempt_count(db: Session, user_id: int) -> int:
    """How many real reset attempts (password+phrase actually checked, pass
    or fail) this user has made in the trailing rate-limit window."""
    window_start = datetime.now(timezone.utc) - timedelta(hours=RATE_LIMIT_WINDOW_HOURS)
    return (
        db.query(func.count(SystemEvent.id))
        .filter(
            SystemEvent.event_type.in_(_RATE_LIMITED_EVENT_TYPES),
            SystemEvent.performed_by == user_id,
            SystemEvent.created_at >= window_start,
        )
        .scalar()
    )


def _clear_directory_contents(path: str) -> None:
    """Deletes everything inside `path` without removing `path` itself.
    `report_storage_path` (and, one level up, `invoice_storage_path`) is a
    Docker volume's mount point (see docker-compose.yml) — rmtree-ing the
    directory itself fails with "Device or resource busy" since the mount
    root can't be unlinked, only emptied. Confirmed directly: an earlier
    version of this function called shutil.rmtree(base_dir) and crashed
    with exactly that OSError on /data/reports. See docs/decisions-log.md."""
    if not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)
        return
    for entry in os.scandir(path):
        if entry.is_dir(follow_symlinks=False):
            shutil.rmtree(entry.path)
        else:
            os.remove(entry.path)


def _wipe_uploaded_files() -> None:
    """Deletes every original invoice PDF, every signed invoice PDF, and
    every generated report PDF from disk, leaving the base storage
    directories themselves in place and ready for new uploads."""
    for base_dir in (
        os.path.join(app_config.invoice_storage_path, "original"),
        app_config.signed_invoice_storage_path,
        app_config.report_storage_path,
    ):
        _clear_directory_contents(base_dir)


def perform_reset(db: Session, *, wipe_files: bool) -> None:
    """Deletes all app data and reseeds default categories/settings, leaving
    only the Superadmin account and the (never-touched) system_events log.

    Deletion order follows the FK dependency chain — every table with a
    foreign key into another is cleared before the table it points to.
    There is no `notifications` table to clear: docs/database-schema.md
    documents one, but it was never built — dashboard notifications are
    computed live from other tables, not stored (see docs/decisions-log.md's
    2026-08-04 main dashboard build entry). Nothing here needs to touch it.
    """
    db.query(MonthlyReconciliation).delete()
    db.query(Contribution).delete()
    db.query(InvoiceFile).delete()
    db.query(Invoice).delete()
    db.query(PlannedProject).delete()
    db.query(Report).delete()
    db.query(FinancialYear).delete()

    db.query(Category).delete()
    db.bulk_insert_mappings(Category, DEFAULT_CATEGORIES)

    db.query(Setting).delete()
    db.bulk_insert_mappings(Setting, DEFAULT_SETTINGS)

    db.query(User).filter(User.role != "superadmin").delete(synchronize_session=False)

    db.commit()

    if wipe_files:
        _wipe_uploaded_files()
