"""Report ORM model — metadata for AI-generated PDF reports.

Not in docs/database-schema.md (written before this feature existed). Two
columns store data as JSON rather than being normalised out, mirroring how
`settings.value` is a flat key/value store: `categories_included` is the
list of category ids the report was scoped to (empty means "all active
categories at generation time"), and `parameters` is every option the
generation request was called with, kept verbatim so a report stays
self-describing even if a category is later renamed or deactivated. See
docs/decisions-log.md.
"""
from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB

from database import Base

REPORT_TYPES = ("historical", "forecast", "combined")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(f"report_type IN {REPORT_TYPES}", name="ck_reports_report_type"),
    )

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    # Nullable so a permanently-deleted user's reports can be anonymised
    # rather than deleted — see routers/auth.py's DELETE /auth/users/{id}
    # and docs/decisions-log.md.
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    categories_included = Column(JSONB, nullable=False, server_default="[]")
    years_included = Column(Integer, nullable=False, server_default="3")
    report_type = Column(String(20), nullable=False)
    file_path = Column(String(500), nullable=False)
    parameters = Column(JSONB, nullable=False, server_default="{}")
    # Not in the documented schema — added to support soft delete on
    # DELETE /reports/{id}, matching the invoices/contributions precedent.
    # See docs/decisions-log.md.
    deleted = Column(Boolean, nullable=False, default=False, server_default="false")
