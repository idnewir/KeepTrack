"""Budget Planning endpoints: annual category budgets (with optional monthly
overrides), the dashboard-style summary, and the module's own terminology
settings."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.budget import CategoryBudget
from models.category import Category
from models.financial_year import FinancialYear
from models.schemas import (
    BudgetsListOut,
    BudgetSummaryOut,
    BudgetTerminologyOut,
    BudgetTerminologyUpdate,
    CategoryBudgetCreate,
    CategoryBudgetOut,
)
from models.user import User
from services import audit_service, budget_service
from utils.deps import get_current_user, require_admin, require_module

router = APIRouter(prefix="/budgets", tags=["budgets"], dependencies=[Depends(require_module("budget_planning"))])


# Declared ahead of DELETE /{budget_id} for the same reason as
# debts.py's /terminology route — a fixed path must resolve before an
# int-typed path parameter can swallow it.
@router.get("/terminology", response_model=BudgetTerminologyOut)
def get_budget_terminology(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return budget_service.get_budget_terminology(db)


@router.put("/terminology", response_model=BudgetTerminologyOut)
def update_budget_terminology(
    payload: BudgetTerminologyUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    result = budget_service.update_budget_terminology(db, updates, admin.id)
    audit_service.log_action(
        db, "settings.changed", "Budget Planning terminology changed",
        user_id=admin.id, affected_table="settings",
        metadata={"updates": updates},
    )
    return result


@router.get("/summary", response_model=BudgetSummaryOut)
def get_budgets_summary(
    financial_year_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    try:
        return budget_service.budgets_summary(db, financial_year_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.get("", response_model=BudgetsListOut)
def list_budgets(
    financial_year_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    try:
        return budget_service.budgets_list_out(db, financial_year_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("", response_model=CategoryBudgetOut, status_code=status.HTTP_201_CREATED)
def upsert_budget(
    payload: CategoryBudgetCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    category = db.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    try:
        fy = budget_service.resolve_financial_year(db, payload.financial_year_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    budget = (
        db.query(CategoryBudget)
        .filter(CategoryBudget.category_id == category.id, CategoryBudget.financial_year_id == fy.id)
        .first()
    )
    is_new = budget is None
    if budget is None:
        budget = CategoryBudget(
            category_id=category.id,
            financial_year_id=fy.id,
            created_by=admin.id,
        )
        db.add(budget)

    budget.annual_amount = payload.annual_amount
    # Stored as strings — the JSON column serialises via plain json.dumps,
    # which doesn't know how to encode a Decimal. Read back through
    # Decimal(str) in budget_service.compute_monthly_budget, so no precision
    # is lost in the round-trip.
    budget.monthly_amounts = {k: str(v) for k, v in payload.monthly_amounts.items()} if payload.monthly_amounts else None
    db.commit()
    db.refresh(budget)

    action = "budget.created" if is_new else "budget.updated"
    audit_service.log_action(
        db, action, f"{'Set' if is_new else 'Updated'} budget for '{category.name}' ({fy.label})",
        user_id=admin.id, affected_table="category_budgets", affected_record_id=budget.id,
    )
    return budget_service.budget_to_out(db, budget, fy, category)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    budget = db.get(CategoryBudget, budget_id)
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")

    category = db.get(Category, budget.category_id)
    fy = db.get(FinancialYear, budget.financial_year_id)

    db.delete(budget)
    db.commit()

    audit_service.log_action(
        db, "budget.deleted",
        f"Deleted budget for '{category.name if category else budget.category_id}'"
        f"{f' ({fy.label})' if fy else ''}",
        user_id=admin.id, affected_table="category_budgets", affected_record_id=budget_id,
    )
