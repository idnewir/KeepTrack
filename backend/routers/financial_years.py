"""Financial year endpoints: current financial year lookup and opening balance."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.financial_year import FinancialYear
from models.schemas import FinancialYearOut, OpeningBalanceUpdate
from models.user import User
from services import financial_year_service as fy_service
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/financial-years", tags=["financial-years"])


# Not in the original endpoint list — added so the frontend can fetch the
# current financial year (and check whether its opening balance is set)
# without pulling in the whole /dashboard/summary payload. See
# docs/decisions-log.md (mirrors the precedent set by /auth/setup-status).
@router.get("/current", response_model=FinancialYearOut)
def get_current_financial_year(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return fy_service.get_or_create_financial_year(db)


@router.put("/{financial_year_id}/opening-balance", response_model=FinancialYearOut)
def set_opening_balance(
    financial_year_id: int,
    payload: OpeningBalanceUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    fy = db.get(FinancialYear, financial_year_id)
    if fy is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial year not found")

    fy.opening_balance = payload.opening_balance
    db.commit()
    db.refresh(fy)
    return fy
