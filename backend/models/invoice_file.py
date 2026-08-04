"""Invoice file ORM model — stores the path to the original uploaded PDF."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from database import Base


class InvoiceFile(Base):
    __tablename__ = "invoice_files"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    original_path = Column(String(500), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
