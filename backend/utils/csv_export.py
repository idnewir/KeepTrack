"""Shared CSV-export response builder for list endpoints' /export/csv routes."""
import csv
import io
import re

from fastapi.responses import StreamingResponse

BOM = "﻿"

# Leading characters that Excel/LibreOffice/Google Sheets treat as the start
# of a formula when a cell is opened from CSV. A free-text field a user
# controls (supplier name, notes, group name, username, ...) exported
# unmodified could otherwise execute arbitrary formulas (including calling
# out to external resources) in whoever's spreadsheet software opens the
# export — the classic "CSV injection" / "formula injection" issue. Per
# OWASP's recommendation, any cell starting with one of these is prefixed
# with a single quote, which every major spreadsheet app renders as a
# harmless literal value instead of evaluating it as a formula.
_ALWAYS_ESCAPE_PREFIXES = ("=", "@", "\t", "\r")
# "+"/"-" alone are also technically formula-starting characters, but this
# app legitimately exports negative/positive numbers as pre-formatted
# strings (e.g. a reconciliation discrepancy, a year-on-year percentage) —
# escaping "-15.00" would turn a real figure into text in the spreadsheet.
# Only escape when the sign isn't immediately followed by a digit, which
# covers the formula case ("-cmd|...", "+HYPERLINK(...)") without mangling
# ordinary numbers.
_SIGNED_NON_NUMERIC_RE = re.compile(r"^[+-](?!\d)")


def _escape_cell(value):
    if not isinstance(value, str) or not value:
        return value
    if value.startswith(_ALWAYS_ESCAPE_PREFIXES) or _SIGNED_NON_NUMERIC_RE.match(value):
        return "'" + value
    return value


def csv_response(filename: str, headers: list[str], rows: list[list]) -> StreamingResponse:
    buffer = io.StringIO()
    # A leading BOM lets Excel auto-detect UTF-8 rather than mangling
    # anything outside ASCII (e.g. a "£" amount or an accented supplier name).
    buffer.write(BOM)
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows([_escape_cell(cell) for cell in row] for row in rows)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
