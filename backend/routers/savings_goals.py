"""Savings Goals endpoints: create/edit goals, log contributions toward
them, and mark them complete/cancelled. Part of the Budget Planning module."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.budget import SavingsGoal
from models.category import Category
from models.schemas import SavingsGoalContribute, SavingsGoalCreate, SavingsGoalOut, SavingsGoalUpdate
from models.user import User
from services import audit_service, budget_service, notification_service
from utils.deps import get_current_user, require_admin, require_module, require_standard

router = APIRouter(
    prefix="/savings-goals", tags=["savings-goals"], dependencies=[Depends(require_module("budget_planning"))]
)


@router.get("", response_model=list[SavingsGoalOut])
def list_savings_goals(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return budget_service.list_savings_goals(db)


@router.post("", response_model=SavingsGoalOut, status_code=status.HTTP_201_CREATED)
def create_savings_goal(
    payload: SavingsGoalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    if payload.category_id is not None and db.get(Category, payload.category_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    goal = SavingsGoal(
        name=payload.name,
        description=payload.description,
        target_amount=payload.target_amount,
        target_date=payload.target_date,
        category_id=payload.category_id,
        financial_year_id=payload.financial_year_id,
        created_by=user.id,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)

    audit_service.log_action(
        db, "savings_goal.created", f"Created savings goal '{goal.name}'",
        user_id=user.id, affected_table="savings_goals", affected_record_id=goal.id,
    )
    return budget_service.savings_goal_to_out(db, goal)


@router.put("/{goal_id}", response_model=SavingsGoalOut)
def update_savings_goal(
    goal_id: int,
    payload: SavingsGoalUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    goal = db.get(SavingsGoal, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in ("active", "completed", "cancelled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "status must be one of: active, completed, cancelled")
    if "category_id" in updates and updates["category_id"] is not None and db.get(Category, updates["category_id"]) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    for field, value in updates.items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)

    audit_service.log_action(
        db, "savings_goal.edited", f"Edited savings goal '{goal.name}'",
        user_id=user.id, affected_table="savings_goals", affected_record_id=goal.id,
    )
    return budget_service.savings_goal_to_out(db, goal)


@router.post("/{goal_id}/contribute", response_model=SavingsGoalOut)
def contribute_to_savings_goal(
    goal_id: int,
    payload: SavingsGoalContribute,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    goal = db.get(SavingsGoal, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")

    goal.current_amount = goal.current_amount + payload.amount
    just_completed = goal.status == "active" and goal.current_amount >= goal.target_amount
    if just_completed:
        goal.status = "completed"
    db.commit()
    db.refresh(goal)

    note = f" — {payload.notes}" if payload.notes else ""
    audit_service.log_action(
        db, "savings_goal.contribution", f"Added £{payload.amount} to '{goal.name}'{note}",
        user_id=user.id, affected_table="savings_goals", affected_record_id=goal.id,
        metadata={"amount": str(payload.amount), "notes": payload.notes},
    )

    if just_completed:
        notification_service.notify_admins(
            db,
            type=f"savings_goal_completed_{goal.id}",
            title="Savings goal completed!",
            message=f"Savings goal '{goal.name}' completed!",
            link="/budget?tab=savings-goals",
            severity="info",
        )
        audit_service.log_action(
            db, "savings_goal.completed", f"Savings goal '{goal.name}' completed",
            user_id=user.id, affected_table="savings_goals", affected_record_id=goal.id,
        )

    return budget_service.savings_goal_to_out(db, goal)


@router.delete("/{goal_id}", response_model=SavingsGoalOut)
def cancel_savings_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Soft delete: marks the goal cancelled rather than removing the row,
    so a mistaken contribution history isn't lost. See docs/decisions-log.md."""
    goal = db.get(SavingsGoal, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")

    goal.status = "cancelled"
    db.commit()
    db.refresh(goal)

    audit_service.log_action(
        db, "savings_goal.cancelled", f"Cancelled savings goal '{goal.name}'",
        user_id=admin.id, affected_table="savings_goals", affected_record_id=goal.id,
    )
    return budget_service.savings_goal_to_out(db, goal)
