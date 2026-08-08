"""Debt Tracking endpoints: manage debts, log payments, mark debts paid off,
and the module's own terminology settings."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.debt import Debt, DebtPayment
from models.schemas import (
    DebtCreate,
    DebtDetailOut,
    DebtOut,
    DebtPaymentCreate,
    DebtPaymentOut,
    DebtTerminologyOut,
    DebtTerminologyUpdate,
    DebtUpdate,
)
from models.user import User
from services import audit_service, debt_service
from services.settings_service import get_notification_thresholds
from utils.deps import get_current_user, require_admin, require_module, require_standard

router = APIRouter(prefix="/debts", tags=["debts"], dependencies=[Depends(require_module("debt_tracking"))])


# Declared ahead of GET/{debt_id} so "/debts/terminology" resolves here
# rather than being swallowed by the int-typed {debt_id} path — Starlette
# commits to the first syntactically matching route, so ordering matters.
@router.get("/terminology", response_model=DebtTerminologyOut)
def get_debt_terminology(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return debt_service.get_debt_terminology(db)


@router.put("/terminology", response_model=DebtTerminologyOut)
def update_debt_terminology(
    payload: DebtTerminologyUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    result = debt_service.update_debt_terminology(db, updates, admin.id)
    audit_service.log_action(
        db, "settings.changed", "Debt Tracking terminology changed",
        user_id=admin.id, affected_table="settings",
        metadata={"updates": updates},
    )
    return result


@router.get("", response_model=list[DebtOut])
def list_debts(
    sort: str | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    debts = db.query(Debt).filter(Debt.active.is_(True)).all()
    promo_warning_days = get_notification_thresholds(db)["notif_promo_rate_warning_days"]
    items = [debt_service.debt_to_out(db, d, promo_warning_days=promo_warning_days) for d in debts]
    return debt_service.sort_debts(items, sort)


@router.get("/{debt_id}", response_model=DebtDetailOut)
def get_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    debt = db.get(Debt, debt_id)
    if debt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")
    return debt_service.debt_to_detail_out(db, debt)


def _validate_promo_fields(debt: Debt) -> None:
    if debt.rate_type in ("promotional", "zero") and (
        debt.promotional_end_date is None or debt.standard_rate_after_promo is None
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Promotional end date and standard rate after promotion are required for a promotional/0% rate",
        )


@router.post("", response_model=DebtOut, status_code=status.HTTP_201_CREATED)
def create_debt(
    payload: DebtCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    if payload.debt_type == "other" and not payload.custom_type_label:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A custom type label is required when debt type is 'other'")

    debt = Debt(
        name=payload.name,
        debt_type=payload.debt_type,
        custom_type_label=payload.custom_type_label if payload.debt_type == "other" else None,
        current_balance=payload.current_balance,
        # Set once, here, to the balance at creation — the fixed baseline
        # percent_paid is measured against for the life of the debt.
        original_balance=payload.current_balance,
        credit_limit=payload.credit_limit,
        monthly_payment=payload.monthly_payment,
        payment_due_day=payload.payment_due_day,
        start_date=payload.start_date,
        expected_end_date=payload.expected_end_date,
        interest_rate=payload.interest_rate,
        rate_type=payload.rate_type,
        promotional_end_date=payload.promotional_end_date if payload.rate_type in ("promotional", "zero") else None,
        standard_rate_after_promo=payload.standard_rate_after_promo if payload.rate_type in ("promotional", "zero") else None,
        notes=payload.notes,
        created_by=user.id,
    )
    _validate_promo_fields(debt)
    db.add(debt)
    db.commit()
    db.refresh(debt)

    audit_service.log_action(
        db, "debt.created", f"Created debt '{debt.name}'",
        user_id=user.id, affected_table="debts", affected_record_id=debt.id,
    )
    return debt_service.debt_to_out(db, debt)


@router.put("/{debt_id}", response_model=DebtOut)
def update_debt(
    debt_id: int,
    payload: DebtUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    debt = db.get(Debt, debt_id)
    if debt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(debt, field, value)

    if debt.debt_type == "other" and not debt.custom_type_label:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A custom type label is required when debt type is 'other'")
    if debt.debt_type != "other":
        debt.custom_type_label = None
    if debt.rate_type not in ("promotional", "zero"):
        debt.promotional_end_date = None
        debt.standard_rate_after_promo = None
    _validate_promo_fields(debt)

    db.commit()
    db.refresh(debt)

    audit_service.log_action(
        db, "debt.edited", f"Edited debt '{debt.name}'",
        user_id=user.id, affected_table="debts", affected_record_id=debt.id,
    )
    return debt_service.debt_to_out(db, debt)


@router.delete("/{debt_id}", response_model=DebtOut)
def deactivate_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    debt = db.get(Debt, debt_id)
    if debt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")

    debt.active = False
    db.commit()
    db.refresh(debt)

    audit_service.log_action(
        db, "debt.deleted", f"Deleted debt '{debt.name}'",
        user_id=admin.id, affected_table="debts", affected_record_id=debt.id,
    )
    return debt_service.debt_to_out(db, debt)


@router.post("/{debt_id}/mark-paid", response_model=DebtOut)
def mark_debt_paid(
    debt_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    debt = db.get(Debt, debt_id)
    if debt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")

    debt_service.mark_paid_off(db, debt, user.id)

    audit_service.log_action(
        db, "debt.paid_off", f"Marked debt '{debt.name}' as paid off",
        user_id=user.id, affected_table="debts", affected_record_id=debt.id,
    )
    return debt_service.debt_to_out(db, debt)


@router.post("/{debt_id}/payments", response_model=DebtPaymentOut, status_code=status.HTTP_201_CREATED)
def log_payment(
    debt_id: int,
    payload: DebtPaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    debt = db.get(Debt, debt_id)
    if debt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")

    payment = DebtPayment(
        debt_id=debt.id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        notes=payload.notes,
        recorded_by=user.id,
    )
    db.add(payment)

    new_balance = debt.current_balance - payload.amount
    debt.current_balance = new_balance if new_balance > 0 else Decimal("0.00")
    db.commit()
    db.refresh(payment)
    db.refresh(debt)

    audit_service.log_action(
        db, "debt.payment_logged", f"Logged payment of £{payload.amount} on '{debt.name}'",
        user_id=user.id, affected_table="debt_payments", affected_record_id=payment.id,
    )

    if new_balance <= 0:
        debt_service.mark_paid_off(db, debt, user.id)
        audit_service.log_action(
            db, "debt.paid_off", f"Debt '{debt.name}' automatically marked paid off (balance reached zero)",
            user_id=user.id, affected_table="debts", affected_record_id=debt.id,
        )
    else:
        debt_service.check_and_fire_milestones(db, debt, user.id)

    return debt_service.payment_to_out(payment, {user.id: user.username})


@router.delete("/{debt_id}/payments/{payment_id}", response_model=DebtOut)
def delete_payment(
    debt_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    debt = db.get(Debt, debt_id)
    if debt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Debt not found")
    payment = db.get(DebtPayment, payment_id)
    if payment is None or payment.debt_id != debt_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    # Restores the balance rather than leaving it wherever it landed —
    # deleting a mis-logged payment should undo its effect entirely,
    # including reopening a debt an over-large payment had auto-closed.
    debt.current_balance = debt.current_balance + payment.amount
    if debt.is_paid_off and debt.current_balance > 0:
        debt.is_paid_off = False
        debt.paid_off_date = None
    db.delete(payment)
    db.commit()
    db.refresh(debt)

    audit_service.log_action(
        db, "debt.payment_deleted", f"Deleted payment of £{payment.amount} from '{debt.name}'",
        user_id=admin.id, affected_table="debt_payments", affected_record_id=payment_id,
    )
    return debt_service.debt_to_out(db, debt)
