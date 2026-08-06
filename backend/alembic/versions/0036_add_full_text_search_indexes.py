"""add full text search GIN indexes

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-08-06 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a8'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Weighted rather than the plain `to_tsvector('english', coalesce(supplier,
# '') || ' ' || coalesce(notes, '') || ' ' || coalesce(filename, ''))` a
# simpler version of this feature might use: every lexeme in a plain
# concatenated tsvector gets PostgreSQL's default weight ('D'), so there
# would be no way to actually rank a supplier-name match above a
# filename match at query time — "weighted highest" would only be true in
# name. setweight()-labelling each column before concatenating (A for
# supplier, B for notes, C for filename — PostgreSQL's four weight buckets,
# highest to lowest) means ts_rank on this same expression genuinely
# reflects which column matched. services/search_service.py's query
# constructs this identical expression for both the `@@` match and the
# `ts_rank` ordering, so the GIN index below is usable for both. See
# docs/decisions-log.md.
_INVOICES_TSVECTOR_SQL = """
    (
        setweight(to_tsvector('english', coalesce(supplier, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(notes, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(filename, '')), 'C')
    )
"""


def upgrade() -> None:
    op.execute(
        f"CREATE INDEX idx_invoices_fts ON invoices USING GIN ({_INVOICES_TSVECTOR_SQL})"
    )
    op.execute(
        "CREATE INDEX idx_categories_fts ON categories "
        "USING GIN (to_tsvector('english', coalesce(name, '')))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_categories_fts")
    op.execute("DROP INDEX IF EXISTS idx_invoices_fts")
