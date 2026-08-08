"""Permanent user deletion with GDPR right-to-erasure anonymisation.

Unlike DELETE /auth/reject-user/{id} (a pending registration with no
financial history) and PUT /auth/users/{id}/deactivate (reversible, keeps
every record's real attribution), this is a one-way action for an account
that already has a real history attached to it. Deleting the row outright
would either violate every NOT NULL users.id foreign key across the app's
financial tables or, if those were simply cascaded, destroy the financial
record itself — neither is acceptable, since GDPR's right to erasure covers
personal data, not an organisation's own financial audit trail (e.g. a
committee's HMRC/charity accounting obligations). So this anonymises: every
personal-data column and file is deleted, every financial-record foreign key
that pointed at this user is set to NULL, and audit_log/audit_log_archive
rows are kept but stripped of the association (`user_id = NULL`) with a
'[Deleted User]' marker prepended to their description text. See
docs/decisions-log.md.
"""
from sqlalchemy.orm import Session

from models.audit_log import AuditLog, AuditLogArchive
from models.budget import CategoryBudget, SavingsGoal
from models.contribution import Contribution
from models.debt import Debt, DebtPayment
from models.error_log import ErrorLog
from models.import_batch import ImportBatch
from models.invoice import Invoice
from models.mfa_remember_token import MfaRememberToken
from models.monthly_reconciliation import MonthlyReconciliation
from models.notification import Notification
from models.planned_project import PlannedProject
from models.report import Report
from models.setting import Setting
from models.system_event import SystemEvent
from models.user import User
from services import audit_service, profile_service

DELETE_USER_CONFIRMATION_PHRASE = "DELETE USER"

# (model, column) pairs whose users.id foreign key gets anonymised to NULL
# rather than the row being deleted — see module docstring.
_ANONYMISE_COLUMNS = [
    (Invoice, "created_by"),
    (Contribution, "recorded_by"),
    (MonthlyReconciliation, "reconciled_by"),
    (MonthlyReconciliation, "edited_by"),
    (PlannedProject, "created_by"),
    (PlannedProject, "edited_by"),
    (Report, "generated_by"),
    (Debt, "created_by"),
    (DebtPayment, "recorded_by"),
    (CategoryBudget, "created_by"),
    (SavingsGoal, "created_by"),
    (ImportBatch, "imported_by"),
    (ErrorLog, "user_id"),
    (ErrorLog, "resolved_by"),
    (Setting, "updated_by"),
    (SystemEvent, "performed_by"),
]


def _anonymise_audit_entries(db: Session, model, user_id: int) -> None:
    entries = db.query(model).filter(model.user_id == user_id).all()
    for entry in entries:
        entry.user_id = None
        if not entry.description.startswith("[Deleted User]"):
            entry.description = f"[Deleted User] {entry.description}"


def permanently_delete_user(db: Session, target: User, admin: User) -> None:
    """Anonymises `target`'s financial-record attribution and audit trail,
    deletes their personal data, and deletes their user row — all in one
    transaction, committed once at the end so a failure partway through
    leaves the original account untouched rather than half-anonymised."""
    username = target.username

    # Logged first so this entry exists even though the caller commits once
    # at the end — the task brief's "before deletion" refers to it being
    # written before the DB DELETE below runs, which this ordering respects.
    audit_service.log_action(
        db, "user.deleted",
        f"'{username}' permanently deleted by '{admin.username}'. "
        "All personal data anonymised per GDPR right to erasure.",
        user_id=admin.id, affected_table="users", affected_record_id=target.id,
    )

    _anonymise_audit_entries(db, AuditLog, target.id)
    _anonymise_audit_entries(db, AuditLogArchive, target.id)

    for model, column in _ANONYMISE_COLUMNS:
        db.query(model).filter(getattr(model, column) == target.id).update(
            {column: None}, synchronize_session=False
        )

    if target.has_avatar:
        profile_service.remove_avatar(target.id)
    if target.has_signature:
        profile_service.remove_signature(target.id)

    db.query(MfaRememberToken).filter(MfaRememberToken.user_id == target.id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == target.id).delete(synchronize_session=False)

    db.delete(target)
    db.commit()
