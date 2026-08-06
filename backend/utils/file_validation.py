"""Shared upload validation: PDF magic-byte sniffing, size limits, and
filename sanitisation.

A browser-supplied Content-Type header and a ".pdf" filename extension are
both attacker-controlled and prove nothing about what's actually inside an
uploaded file — this checks the file's own magic bytes instead, per the
security requirement that upload validation not rely on extension/MIME type
alone.
"""
import re

PDF_MAGIC = b"%PDF-"
# The PDF spec permits up to 1024 bytes of implementation-specific junk
# before the header (some scanners/exporters prepend a BOM or comment), so
# this checks a window rather than requiring the magic bytes at offset 0.
_PDF_HEADER_SEARCH_WINDOW = 1024

MAX_INVOICE_PDF_BYTES = 25 * 1024 * 1024  # 25 MB — comfortably covers a scanned multi-page invoice

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def looks_like_pdf(content: bytes) -> bool:
    return PDF_MAGIC in content[:_PDF_HEADER_SEARCH_WINDOW]


def sanitise_filename(filename: str) -> str:
    """Strips control characters (including CR/LF) from a user-supplied
    filename before it's stored or displayed. An unsanitised filename
    containing a newline could otherwise inject extra lines into an HTTP
    response header (e.g. Content-Disposition) wherever it's later echoed
    back on download."""
    cleaned = _CONTROL_CHARS_RE.sub("", filename).strip()
    return cleaned or "invoice.pdf"
