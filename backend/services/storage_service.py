"""Local filesystem storage for uploaded invoice PDFs and generated reports.

Original invoice PDFs are kept under INVOICE_STORAGE_PATH/original/{year}/{month}/,
named with a UUID prefix to avoid filename collisions. INVOICE_STORAGE_PATH
is backed by the `invoice_storage` Docker volume (see docker-compose.yml),
so files persist across container restarts. Generated report PDFs follow the
same pattern under REPORT_STORAGE_PATH/{year}/{month}/, on the separate
`report_storage` volume — see docs/decisions-log.md for why a second,
dedicated volume was added rather than reusing invoice_storage or the
`/app/storage/reports/` path named in this feature's task brief (an
unmounted path wouldn't survive a container restart, the same reasoning
already applied to invoice and signed-invoice storage).
"""
import os
import re
import uuid
from datetime import date

from config import settings

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def save_invoice_pdf(filename: str, content: bytes, upload_date: date | None = None) -> str:
    """Save a PDF's bytes to disk and return the path it was written to."""
    upload_date = upload_date or date.today()
    target_dir = os.path.join(
        settings.invoice_storage_path,
        "original",
        f"{upload_date.year:04d}",
        f"{upload_date.month:02d}",
    )
    os.makedirs(target_dir, exist_ok=True)

    # basename() strips any directory component an attacker could smuggle in
    # via the uploaded filename, and the UUID prefix avoids collisions.
    safe_filename = os.path.basename(filename)
    stored_name = f"{uuid.uuid4().hex}_{safe_filename}"
    full_path = os.path.join(target_dir, stored_name)

    with open(full_path, "wb") as f:
        f.write(content)

    return full_path


def save_report_pdf(content: bytes, title: str, generated_at: date | None = None) -> str:
    """Save a generated report PDF and return the path it was written to."""
    generated_at = generated_at or date.today()
    target_dir = os.path.join(
        settings.report_storage_path,
        f"{generated_at.year:04d}",
        f"{generated_at.month:02d}",
    )
    os.makedirs(target_dir, exist_ok=True)

    slug = _SLUG_RE.sub("-", title.lower()).strip("-") or "report"
    stored_name = f"{uuid.uuid4().hex}_{slug}.pdf"
    full_path = os.path.join(target_dir, stored_name)

    with open(full_path, "wb") as f:
        f.write(content)

    return full_path
