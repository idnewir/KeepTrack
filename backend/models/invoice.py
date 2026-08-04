"""Invoice ORM model — see docs/database-schema.md for the source schema."""
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)

from database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    upload_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    invoice_date = Column(Date, nullable=False)
    supplier = Column(String(255), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"))
    notes = Column(Text)
    signed = Column(Boolean, nullable=False, default=False, server_default="false")
    signed_pdf_path = Column(String(500))
    # Nullable for now — financial year assignment isn't implemented yet (see
    # docs/decisions-log.md); the schema doc's NOT NULL is aspirational.
    financial_year_id = Column(Integer, ForeignKey("financial_years.id"), nullable=True)
    reviewed = Column(Boolean, nullable=False, default=False, server_default="false")
    duplicate_flag = Column(Boolean, nullable=False, default=False, server_default="false")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Not in the documented schema — added to support soft delete on
    # DELETE /invoices/{id}. See docs/decisions-log.md.
    deleted = Column(Boolean, nullable=False, default=False, server_default="false")
