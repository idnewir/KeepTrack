"""Planned project ORM model.

expected_month is stored as a DATE (first of the month), not the SMALLINT
1-12 documented in docs/database-schema.md, and this table also carries an
`active` flag not in that doc — both required by the dashboard build's task
brief. `completed` was added later to distinguish a finished project from
one an Admin simply deactivated. See docs/decisions-log.md.
"""
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func

# is_funding_target/funding_target_amount/funding_target_date/funding_notes
# added for the "saving toward this project" mode — a project can either
# just track estimated vs. actual spend (the original model) or additionally
# track progress toward a savings goal by a target date. See
# services/project_service.py's funding_progress() and docs/decisions-log.md.

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
    completed = Column(Boolean, nullable=False, default=False, server_default="false")
    # Set only by POST /projects/{id}/complete — added for the project detail
    # page's timeline ("when completed"), which had nothing to show without
    # it. See docs/decisions-log.md.
    completed_at = Column(DateTime(timezone=True), nullable=True)
    # Set only when an Admin corrects a completed (locked) project via
    # admin_override — see docs/decisions-log.md. Null otherwise.
    edited_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    edit_reason = Column(Text, nullable=True)
    # Human-readable record of what changed on an admin-overridden edit
    # (e.g. the previous estimated_cost), not a general free-text notes field.
    admin_edit_notes = Column(Text, nullable=True)
    is_funding_target = Column(Boolean, nullable=False, default=False, server_default="false")
    funding_target_amount = Column(Numeric(12, 2), nullable=True)
    funding_target_date = Column(Date, nullable=True)
    funding_notes = Column(String(1000), nullable=True)
