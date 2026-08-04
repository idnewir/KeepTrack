"""Local filesystem storage for uploaded invoice PDFs.

Original PDFs are kept under INVOICE_STORAGE_PATH/original/{year}/{month}/,
named with a UUID prefix to avoid filename collisions. INVOICE_STORAGE_PATH
is backed by the `invoice_storage` Docker volume (see docker-compose.yml),
so files persist across container restarts.
"""
import os
import uuid
from datetime import date

from config import settings


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
