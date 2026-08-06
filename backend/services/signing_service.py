"""Overlays a drawn signature image and date text onto an invoice PDF.

The original PDF is never modified: this always writes a new file under
storage_service.invoices_signed_root() and returns its path, mirroring how
storage_service.save_invoice_pdf lays out originals under
invoices_original_root()/{year}/{month}/.
"""
import base64
import binascii
import os
import uuid
from datetime import date as date_type

import fitz
from sqlalchemy.orm import Session

from services import storage_service


def _decode_signature_image(signature_image: str) -> bytes:
    # Accepts either a raw base64 string or a full data URL
    # ("data:image/png;base64,...."); only the payload after the comma matters.
    payload = signature_image.split(",", 1)[-1] if "," in signature_image else signature_image
    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Signature image is not valid base64") from exc


def sign_invoice_pdf(
    db: Session,
    original_path: str,
    signature_image: str,
    signed_date: date_type,
    page_number: int,
    x_pct: float,
    y_pct: float,
    width_pct: float,
    height_pct: float,
    signer_name: str,
    additional_text: str | None = None,
) -> str:
    """Return the path of a new signed copy of `original_path` with the
    signature image, the signer's name, the date, and any additional text
    stacked top-to-bottom inside the given placement box. Position/size are
    percentages of that page's width/height, so they're independent of the
    resolution the frontend rendered at.

    signer_name is resolved by the caller (routers/invoices.py) from the
    signing user's profile — display_name if set, otherwise username — not
    taken from the request payload, so it can't be spoofed to claim a
    signature belongs to someone else. See docs/decisions-log.md.
    """
    image_bytes = _decode_signature_image(signature_image)

    doc = fitz.open(original_path)
    try:
        page_index = page_number - 1
        if page_index < 0 or page_index >= doc.page_count:
            raise ValueError(
                f"Page {page_number} does not exist — this document has {doc.page_count} page(s)"
            )

        page = doc[page_index]
        page_width, page_height = page.rect.width, page.rect.height

        box_w = max(1.0, min(width_pct, 100.0)) / 100 * page_width
        box_h = max(1.0, min(height_pct, 100.0)) / 100 * page_height
        box_x0 = max(0.0, min(x_pct, 100.0)) / 100 * page_width
        box_y0 = max(0.0, min(y_pct, 100.0)) / 100 * page_height
        # Clamp so the box can never spill off the page, even with an
        # unexpected combination of position and size.
        box_x0 = max(0.0, min(box_x0, page_width - box_w))
        box_y0 = max(0.0, min(box_y0, page_height - box_h))

        # Text rows below the signature image: name, date, and (if given)
        # additional free text — one row each, stacked top to bottom per the
        # required layout. More rows means less room needs to be reserved
        # for each, so the signature image keeps a fixed share of the box
        # (55%) and the text rows split whatever remains.
        text_rows = [signer_name, f"Signed: {signed_date.isoformat()}"]
        if additional_text:
            text_rows.append(additional_text)

        signature_height = box_h * 0.55
        signature_rect = fitz.Rect(box_x0, box_y0, box_x0 + box_w, box_y0 + signature_height)
        page.insert_image(signature_rect, stream=image_bytes, keep_proportion=True)

        row_height = (box_h - signature_height) / len(text_rows)
        for i, line in enumerate(text_rows):
            row_y0 = box_y0 + signature_height + i * row_height
            row_rect = fitz.Rect(box_x0, row_y0, box_x0 + box_w, row_y0 + row_height)
            page.insert_textbox(
                row_rect,
                line,
                fontsize=9,
                align=fitz.TEXT_ALIGN_CENTER,
            )

        today = date_type.today()
        target_dir = os.path.join(
            storage_service.invoices_signed_root(db),
            f"{today.year:04d}",
            f"{today.month:02d}",
        )
        os.makedirs(target_dir, exist_ok=True)

        original_name = os.path.basename(original_path)
        signed_path = os.path.join(target_dir, f"{uuid.uuid4().hex}_{original_name}")
        doc.save(signed_path)
        return signed_path
    finally:
        doc.close()
