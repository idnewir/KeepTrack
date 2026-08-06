"""CSV parsing and column-mapping helpers for bulk historical invoice
import (POST /imports/csv). Kept as pure functions, separate from
routers/imports.py, so parsing/matching logic can be exercised without a
database session or an HTTP request.
"""
import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from models.category import Category

_NORMALISE_RE = re.compile(r"[^a-z0-9]")

# Alias lists cover both the KHOC_Master_Invoices.csv column names ("Invoice
# Date", "Duplicate Flag") and the simpler format ("Date") the task brief
# also asks this to accept — matched after normalising away spaces,
# punctuation, and case, so "Amount (£)" (the downloadable template's own
# header) and "Amount" both normalise to "amount".
DATE_ALIASES = ("invoicedate", "date")
SUPPLIER_ALIASES = ("supplier",)
AMOUNT_ALIASES = ("amount",)
CATEGORY_ALIASES = ("category",)
NOTES_ALIASES = ("notes",)
DUPLICATE_ALIASES = ("duplicateflag",)
FILENAME_ALIASES = ("filename",)

FALLBACK_CATEGORY_NAME = "General Maintenance"

# Ordered so the UK convention (DD/MM/YYYY) is tried before the ambiguous
# US one — this app and its first deployment (KHOC) are both UK-based, and
# the task brief only asks for DD/MM/YYYY, YYYY-MM-DD, and MM/YYYY.
_DATE_FORMATS_FULL = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y")
_DATE_FORMATS_MONTH_ONLY = ("%m/%Y", "%Y-%m", "%m-%Y")


def _normalise_header(header: str) -> str:
    return _NORMALISE_RE.sub("", header.lower())


def detect_column_map(headers: list[str]) -> dict[str, int]:
    """Logical field name -> column index, auto-detected from the header
    row. A field absent from the CSV is simply absent from the result."""
    normalised = {_normalise_header(h): i for i, h in enumerate(headers)}

    def find(aliases):
        for alias in aliases:
            if alias in normalised:
                return normalised[alias]
        return None

    mapping = {
        "date": find(DATE_ALIASES),
        "supplier": find(SUPPLIER_ALIASES),
        "amount": find(AMOUNT_ALIASES),
        "category": find(CATEGORY_ALIASES),
        "notes": find(NOTES_ALIASES),
        "duplicate_flag": find(DUPLICATE_ALIASES),
        "filename": find(FILENAME_ALIASES),
    }
    return {k: v for k, v in mapping.items() if v is not None}


def parse_csv_text(content: bytes) -> tuple[list[str], list[list[str]]]:
    """Decodes CSV bytes (tolerating a UTF-8 BOM, which Excel adds) and
    returns (headers, data_rows). Blank rows and a leading '#'-prefixed
    README/comment row (see the downloadable template) are dropped — neither
    is data."""
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = [
        row for row in reader
        if any(cell.strip() for cell in row) and not row[0].strip().startswith("#")
    ]
    if not rows:
        return [], []
    return rows[0], rows[1:]


def parse_amount(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    cleaned = raw.strip().replace(",", "").replace("£", "").replace("$", "")
    if not cleaned:
        return None
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    if negative:
        cleaned = cleaned[1:-1]
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None
    return -value if negative else value


def parse_flexible_date(raw: str | None) -> date | None:
    if not raw:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    for fmt in _DATE_FORMATS_FULL:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    for fmt in _DATE_FORMATS_MONTH_ONLY:
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return date(parsed.year, parsed.month, 1)
        except ValueError:
            continue
    return None


def match_category(raw: str | None, categories: list[Category]) -> tuple[int | None, bool]:
    """(category_id, matched). matched=False means nothing recognisable was
    found and the General Maintenance fallback was used instead (or no
    category could be assigned at all, if that fallback doesn't exist)."""
    if raw:
        norm = raw.strip().lower()
        if norm:
            for cat in categories:
                if cat.name.lower() == norm:
                    return cat.id, True
            for cat in categories:
                name_lower = cat.name.lower()
                if norm in name_lower or name_lower in norm:
                    return cat.id, True

    fallback = next((c for c in categories if c.name.lower() == FALLBACK_CATEGORY_NAME.lower()), None)
    return (fallback.id if fallback else None), False


def is_duplicate_flag(raw: str | None) -> bool:
    return bool(raw) and raw.strip().lower() in ("yes", "true")


def is_remittance_advice(notes: str | None) -> bool:
    return bool(notes) and "remittance advice" in notes.lower()


def parse_row(row: list[str], column_map: dict[str, int], categories: list[Category]) -> dict:
    """Parses one data row into its invoice fields, or sets skip_reason if
    the row should not become an invoice at all."""

    def cell(name: str) -> str | None:
        idx = column_map.get(name)
        if idx is None or idx >= len(row):
            return None
        return row[idx]

    notes_raw = cell("notes")
    amount = parse_amount(cell("amount"))

    result = {
        "invoice_date": parse_flexible_date(cell("date")),
        "supplier": (cell("supplier") or "").strip(),
        "amount": amount,
        "notes": (notes_raw or "").strip() or None,
        "filename": (cell("filename") or "").strip() or None,
        "duplicate_flag": is_duplicate_flag(cell("duplicate_flag")),
        "category_id": None,
        "skip_reason": None,
    }

    if is_remittance_advice(notes_raw):
        result["skip_reason"] = "Remittance advice (not an invoice)"
        return result

    if amount is None or amount <= 0:
        result["skip_reason"] = "Missing, zero, or unparsable amount"
        return result

    category_id, matched = match_category(cell("category"), categories)
    result["category_id"] = category_id
    if not matched:
        raw_category = (cell("category") or "").strip()
        note = (
            f"Category '{raw_category}' not recognised — assigned to {FALLBACK_CATEGORY_NAME}"
            if raw_category
            else f"No category given — assigned to {FALLBACK_CATEGORY_NAME}"
        )
        result["notes"] = f"{result['notes']}; {note}" if result["notes"] else note

    return result
