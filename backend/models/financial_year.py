"""Financial year ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import Column, Date, Integer, Numeric, String

from database import Base


class FinancialYear(Base):
    __tablename__ = "financial_years"

    id = Column(Integer, primary_key=True)
    label = Column(String(20), unique=True, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    # Not in the documented schema — added so PUT /financial-years/{id}/opening-balance
    # has somewhere to store the value. Nullable: unset until an Admin sets it,
    # which the dashboard/contributions pages prompt for. See docs/decisions-log.md.
    opening_balance = Column(Numeric(12, 2), nullable=True)
