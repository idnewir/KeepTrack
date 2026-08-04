"""Financial year ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import Column, Date, Integer, String

from database import Base


class FinancialYear(Base):
    __tablename__ = "financial_years"

    id = Column(Integer, primary_key=True)
    label = Column(String(20), unique=True, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
