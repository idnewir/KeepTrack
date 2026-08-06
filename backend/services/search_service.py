"""Full text search across invoices, contributions, and planned projects,
built on PostgreSQL's native text search (`to_tsvector`/`to_tsquery`) rather
than a separate search engine — see docs/architecture.md and
docs/decisions-log.md.

Query construction (not `websearch_to_tsquery`): the instant-results
dropdown searches as the user types, so the *last* word of a query is
usually still mid-word (e.g. "elect" on the way to "electricity").
`websearch_to_tsquery` — designed for a finished, "as typed into a search
engine" query — has no prefix-matching syntax, so it would only start
returning results once a whole word had been typed. `to_tsquery` supports
prefix matching via a trailing `:*` on a lexeme, so `build_tsquery` below
puts one on the last word only, giving live, "search-as-you-type" matches
while still requiring every earlier word to match a complete (stemmed)
term. User input never reaches `to_tsquery` as a raw string — it's only
ever built from `\\w+`-extracted words, so there's no way for tsquery
operator syntax (`&`, `|`, `!`, parentheses) in the input to be interpreted
as anything other than a literal word to search for.
"""
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import text
from sqlalchemy.orm import Session

from models.planned_project import PlannedProject
from services.project_service import actual_cost_and_invoice_count, compute_status

MIN_QUERY_LENGTH = 2

# Distinct, near-never-occurring-in-real-text control characters delimit a
# match in a ts_headline snippet instead of HTML tags — this app renders no
# raw HTML from user-influenced content anywhere (see docs/security.md), so
# the frontend splits a snippet on these markers and wraps the matched
# spans in its own <mark> elements rather than the backend ever handing back
# markup to be trusted.
HIGHLIGHT_START = ""
HIGHLIGHT_STOP = ""
_HEADLINE_OPTIONS = (
    f"StartSel={HIGHLIGHT_START},StopSel={HIGHLIGHT_STOP},"
    'MaxWords=15,MinWords=4,MaxFragments=2,FragmentDelimiter=" ... "'
)

_WORD_RE = re.compile(r"\w+", re.UNICODE)
_AMOUNT_RE = re.compile(r"^[£$]?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)$")

_DATE_FORMATS_EXACT = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y")
_DATE_FORMATS_MONTH_YEAR = ("%B %Y", "%b %Y", "%Y-%m")
_YEAR_RE = re.compile(r"^(19|20)\d{2}$")


def build_tsquery(q: str) -> str:
    """A `to_tsquery`-ready string built from `q`'s words AND-ed together,
    with the last one made a prefix match — see module docstring."""
    words = _WORD_RE.findall(q)
    if not words:
        return ""
    terms = [f"{w}:*" if i == len(words) - 1 else w for i, w in enumerate(words)]
    return " & ".join(terms)


def parse_amount_query(q: str) -> str | None:
    """A `LIKE` pattern (e.g. '%45.00%') if `q` looks like a plain number or
    a £/$-prefixed amount, else None. Deliberately a substring match, not an
    exact one — "45" is expected to also surface "£145.00", the same way a
    text search doesn't require a whole-field match."""
    match = _AMOUNT_RE.match(q.strip())
    if not match:
        return None
    cleaned = match.group(1).replace(",", "")
    try:
        Decimal(cleaned)
    except InvalidOperation:
        return None
    return f"%{cleaned}%"


def parse_date_query(q: str) -> tuple[date | None, date | None, date | None]:
    """(exact_date, range_start, range_end) — at most one pair is non-None.
    Handles a few common written/ISO date shapes plus a bare month+year or
    bare year (matched as a range spanning that month/year)."""
    cleaned = q.strip()
    for fmt in _DATE_FORMATS_EXACT:
        try:
            return datetime.strptime(cleaned, fmt).date(), None, None
        except ValueError:
            continue
    for fmt in _DATE_FORMATS_MONTH_YEAR:
        try:
            parsed = datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
        start = parsed.replace(day=1)
        end = (date(start.year + 1, 1, 1) if start.month == 12 else date(start.year, start.month + 1, 1)) - timedelta(days=1)
        return None, start, end
    if _YEAR_RE.match(cleaned):
        year = int(cleaned)
        return None, date(year, 1, 1), date(year, 12, 31)
    return None, None, None


def _snippet(row: dict, fields: list[tuple[str, str]]) -> str | None:
    """The first `"{label}: {headline}"` among `fields` (column, label pairs)
    whose ts_headline output actually contains a highlighted match —
    ts_headline still returns (unhighlighted) text for a column that didn't
    match, so presence of HIGHLIGHT_START is what distinguishes a real hit
    from an incidental column."""
    for column, label in fields:
        value = row.get(column)
        if value and HIGHLIGHT_START in value:
            return f"{label}: {value}"
    return None


# The exact expression the migration's idx_invoices_fts GIN index is built
# on — has to match structurally, not just produce equivalent results, for
# PostgreSQL to consider using the index for either the `@@` match or the
# `ts_rank` call below. See alembic/versions/0036_add_full_text_search_indexes.py.
_INVOICE_TSVECTOR_SQL = """
    (
        setweight(to_tsvector('english', coalesce(i.supplier, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(i.notes, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(i.filename, '')), 'C')
    )
"""

_INVOICES_SQL = f"""
    WITH matched AS (
        SELECT
            i.id,
            i.invoice_date,
            i.supplier,
            i.amount,
            i.reviewed,
            i.signed,
            i.is_historical,
            c.name AS category_name,
            c.colour AS category_colour,
            p.name AS project_name,
            ts_rank({_INVOICE_TSVECTOR_SQL}, to_tsquery('english', :tsquery)) AS text_rank,
            (
                {_INVOICE_TSVECTOR_SQL} @@ to_tsquery('english', :tsquery)
            ) AS text_matched,
            ts_headline('english', coalesce(i.supplier, ''), to_tsquery('english', :tsquery), :hl_options) AS supplier_headline,
            ts_headline('english', coalesce(i.notes, ''), to_tsquery('english', :tsquery), :hl_options) AS notes_headline,
            ts_headline('english', coalesce(i.filename, ''), to_tsquery('english', :tsquery), :hl_options) AS filename_headline,
            (
                to_tsvector('english', coalesce(c.name, '')) @@ to_tsquery('english', :tsquery)
            ) AS category_matched,
            (
                :amount_pattern IS NOT NULL AND CAST(i.amount AS TEXT) LIKE :amount_pattern
            ) AS amount_matched,
            (
                (:date_exact IS NOT NULL AND i.invoice_date = :date_exact)
                OR (:date_start IS NOT NULL AND i.invoice_date BETWEEN :date_start AND :date_end)
            ) AS date_matched
        FROM invoices i
        LEFT JOIN categories c ON c.id = i.category_id
        LEFT JOIN planned_projects p ON p.id = i.project_id
        WHERE i.deleted = false
    )
    SELECT *,
        (
            CASE WHEN text_matched THEN text_rank ELSE 0 END
            + CASE WHEN category_matched THEN 0.3 ELSE 0 END
            + CASE WHEN amount_matched THEN 0.2 ELSE 0 END
            + CASE WHEN date_matched THEN 0.2 ELSE 0 END
        ) AS relevance,
        COUNT(*) OVER () AS total_count
    FROM matched
    -- Deliberately not "text_rank > 0" — ts_rank returns a tiny nonzero
    -- float (observed: 1e-20) even for a tsvector/tsquery pair that does
    -- NOT match, an upstream PostgreSQL floating-point quirk in its rank
    -- normalisation arithmetic, not a real partial match. Filtering on that
    -- silently turned this into "every non-deleted invoice always matches
    -- everything" — caught live when a specific amount search returned the
    -- entire table. text_matched (an actual `@@` boolean) is the correct
    -- "did this row's text really match" check. See docs/decisions-log.md.
    WHERE text_matched OR category_matched OR amount_matched OR date_matched
    ORDER BY relevance DESC, invoice_date DESC, id DESC
    LIMIT :limit OFFSET :offset
"""


def search_invoices(db: Session, q: str, page: int, per_page: int) -> tuple[list[dict], int]:
    tsquery = build_tsquery(q)
    amount_pattern = parse_amount_query(q)
    date_exact, date_start, date_end = parse_date_query(q)
    offset = max(0, (max(1, page) - 1) * per_page)

    rows = db.execute(
        text(_INVOICES_SQL),
        {
            "tsquery": tsquery,
            "hl_options": _HEADLINE_OPTIONS,
            "amount_pattern": amount_pattern,
            "date_exact": date_exact,
            "date_start": date_start,
            "date_end": date_end,
            "limit": max(1, per_page),
            "offset": offset,
        },
    ).mappings().all()

    total = rows[0]["total_count"] if rows else 0
    results = []
    for row in rows:
        snippet = _snippet(
            row,
            [("supplier_headline", "Supplier"), ("notes_headline", "Notes"), ("filename_headline", "Filename")],
        )
        if snippet is None:
            if row["amount_matched"]:
                snippet = f"Amount: {row['amount']}"
            elif row["date_matched"]:
                snippet = f"Date: {row['invoice_date']}"
        results.append(
            {
                "id": row["id"],
                "invoice_date": row["invoice_date"],
                "supplier": row["supplier"],
                "amount": row["amount"],
                "category_name": row["category_name"],
                "category_colour": row["category_colour"],
                "reviewed": row["reviewed"],
                "signed": row["signed"],
                "is_historical": row["is_historical"],
                "project_name": row["project_name"],
                "snippet": snippet,
                "relevance": float(row["relevance"]),
            }
        )
    return results, total


_CONTRIBUTIONS_SQL = """
    WITH matched AS (
        SELECT
            ct.id,
            ct.financial_year_id,
            ct.month,
            ct.group_name,
            ct.amount,
            ct.recorded_at,
            ts_rank(to_tsvector('english', coalesce(ct.group_name, '')), to_tsquery('english', :tsquery)) AS text_rank,
            (
                to_tsvector('english', coalesce(ct.group_name, '')) @@ to_tsquery('english', :tsquery)
            ) AS text_matched,
            ts_headline('english', coalesce(ct.group_name, ''), to_tsquery('english', :tsquery), :hl_options) AS group_headline
        FROM contributions ct
        WHERE ct.deleted = false
    )
    SELECT *, COUNT(*) OVER () AS total_count
    FROM matched
    -- See the identical comment on _INVOICES_SQL above — "text_rank > 0" is
    -- not a valid match check (ts_rank can return a tiny nonzero float for
    -- a non-match).
    WHERE text_matched
    ORDER BY text_rank DESC, recorded_at DESC, id DESC
    LIMIT :limit
"""


def search_contributions(db: Session, q: str, limit: int = 20) -> tuple[list[dict], int]:
    """No `notes` column exists on `contributions` (docs/database-schema.md
    lists none, and the ORM model has none either) — despite the task brief
    asking to match on "group_name, notes", there's nothing to search there
    beyond group_name. See docs/decisions-log.md."""
    tsquery = build_tsquery(q)
    rows = db.execute(
        text(_CONTRIBUTIONS_SQL),
        {"tsquery": tsquery, "hl_options": _HEADLINE_OPTIONS, "limit": max(1, limit)},
    ).mappings().all()

    total = rows[0]["total_count"] if rows else 0
    results = [
        {
            "id": row["id"],
            "financial_year_id": row["financial_year_id"],
            "month": row["month"],
            "group_name": row["group_name"],
            "amount": row["amount"],
            "snippet": _snippet(row, [("group_headline", "Group")]),
        }
        for row in rows
    ]
    return results, total


_PROJECTS_TSVECTOR_SQL = """
    (
        setweight(to_tsvector('english', coalesce(pp.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(pp.description, '')), 'B')
    )
"""

_PROJECTS_SQL = f"""
    WITH matched AS (
        SELECT
            pp.id,
            pp.name,
            pp.description,
            pp.estimated_cost,
            pp.completed,
            pp.active,
            ts_rank({_PROJECTS_TSVECTOR_SQL}, to_tsquery('english', :tsquery)) AS text_rank,
            (
                {_PROJECTS_TSVECTOR_SQL} @@ to_tsquery('english', :tsquery)
            ) AS text_matched,
            ts_headline('english', coalesce(pp.name, ''), to_tsquery('english', :tsquery), :hl_options) AS name_headline,
            ts_headline('english', coalesce(pp.description, ''), to_tsquery('english', :tsquery), :hl_options) AS description_headline
        FROM planned_projects pp
    )
    SELECT *, COUNT(*) OVER () AS total_count
    FROM matched
    -- See the identical comment on _INVOICES_SQL above — "text_rank > 0" is
    -- not a valid match check (ts_rank can return a tiny nonzero float for
    -- a non-match).
    WHERE text_matched
    ORDER BY text_rank DESC, id DESC
    LIMIT :limit
"""


def search_projects(db: Session, q: str, limit: int = 20) -> tuple[list[dict], int]:
    tsquery = build_tsquery(q)
    rows = db.execute(
        text(_PROJECTS_SQL),
        {"tsquery": tsquery, "hl_options": _HEADLINE_OPTIONS, "limit": max(1, limit)},
    ).mappings().all()

    total = rows[0]["total_count"] if rows else 0
    results = []
    for row in rows:
        project = db.get(PlannedProject, row["id"])
        actual_cost, _count = actual_cost_and_invoice_count(db, row["id"])
        results.append(
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "estimated_cost": row["estimated_cost"],
                "status": compute_status(project, actual_cost) if project else None,
                "snippet": _snippet(row, [("name_headline", "Name"), ("description_headline", "Description")]),
            }
        )
    return results, total
