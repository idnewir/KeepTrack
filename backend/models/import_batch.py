"""Import batch ORM model — groups invoices created by a single bulk
historical import (CSV or PDF) so they can be reviewed and managed together.
Not in docs/database-schema.md (written before this feature existed). See
docs/decisions-log.md.
"""
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, func

from database import Base

IMPORT_TYPES = ("pdf", "csv")
IMPORT_STATUSES = ("processing", "complete", "partial", "failed")


class ImportBatch(Base):
    __tablename__ = "import_batches"
    __table_args__ = (
        CheckConstraint(f"import_type IN {IMPORT_TYPES}", name="ck_import_batches_import_type"),
        CheckConstraint(f"status IN {IMPORT_STATUSES}", name="ck_import_batches_status"),
    )

    id = Column(Integer, primary_key=True)
    batch_id = Column(String(64), unique=True, nullable=False)
    import_type = Column(String(10), nullable=False)
    filename = Column(String(255), nullable=True)
    total_records = Column(Integer, nullable=False, default=0, server_default="0")
    imported_records = Column(Integer, nullable=False, default=0, server_default="0")
    failed_records = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(String(20), nullable=False)
    imported_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    imported_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    notes = Column(Text, nullable=True)
