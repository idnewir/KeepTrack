"""Renders the first page of an invoice PDF to a PNG thumbnail.

Used by the upload review preview instead of client-side pdf.js rendering,
which was not respecting a PDF's /Rotate page metadata (see
docs/decisions-log.md) — invoices scanned or exported in a rotated
orientation were previewing upside down or cropped.
"""
import fitz

PREVIEW_DPI = 150


def render_pdf_first_page_png(pdf_path: str, dpi: int = PREVIEW_DPI) -> bytes:
    """Return PNG bytes for the first page of the PDF at `pdf_path`."""
    doc = fitz.open(pdf_path)
    try:
        if doc.page_count == 0:
            raise ValueError("PDF has no pages")

        page = doc[0]
        zoom = dpi / 72  # PDF units are 1/72 inch; fitz's default render is 72 DPI
        # get_pixmap()'s default matrix is applied in the page's own rotated
        # coordinate space (page.rect already reflects /Rotate), so the
        # page's rotation metadata is honoured automatically here — no
        # separate rotation step is needed or correct to add on top.
        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        return pixmap.tobytes("png")
    finally:
        doc.close()
