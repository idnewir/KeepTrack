"""Planned project ORM model.

expected_month is stored as a DATE (first of the month), not the SMALLINT
1-12 documented in docs/database-schema.md, and this table also carries an
`active` flag not in that doc — both required by the dashboard build's task
brief. See docs/decisions-log.md.
"""
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func

from database import Base


class PlannedProject(Base):
    __tablename__ = "planned_projects"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    estimated_cost = Column(Numeric(12, 2), nullable=False)
    expected_month = Column(Date, nullable=False)
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    active = Column(Boolean, nullable=False, default=True, server_default="true")
