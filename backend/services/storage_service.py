"""Local filesystem storage for uploaded invoice PDFs and generated reports.

Everything lives under a single configurable root, the `storage_path`
setting (Settings -> Storage & Backup), defaulting to "/data" — the parent
of the `invoice_storage` and `report_storage` Docker volumes already mounted
at /data/invoices and /data/reports (see docker-compose.yml). Original
invoice PDFs are kept under {storage_path}/invoices/original/{year}/{month}/,
signed copies under {storage_path}/invoices/signed/{year}/{month}/, and
generated report PDFs under {storage_path}/reports/{year}/{month}/ — the same
three physical locations earlier builds wrote to when those were three
separate hardcoded config paths (INVOICE_STORAGE_PATH, etc.), so a fresh
install's default doesn't move any existing file. See docs/decisions-log.md.

storage_path is a DB setting rather than only an env var so an Admin can
change it at runtime via PUT /storage/path (see routers/storage.py), with
existing files optionally moved and every invoice_files.original_path /
invoices.signed_pdf_path / reports.file_path updated to match.
"""
import os
import re
import shutil
import uuid
from datetime import date

from sqlalchemy.orm import Session

from models.setting import Setting

_SLUG_RE = re.compile(r"[^a-z0-9]+")

STORAGE_PATH_KEY = "storage_path"
DEFAULT_STORAGE_PATH = "/data"


def get_storage_root(db: Session) -> str:
    setting = db.query(Setting).filter(Setting.key == STORAGE_PATH_KEY).first()
    if setting is None or not setting.value:
        return DEFAULT_STORAGE_PATH
    return setting.value


def invoices_original_root(db: Session) -> str:
    return os.path.join(get_storage_root(db), "invoices", "original")


def invoices_signed_root(db: Session) -> str:
    return os.path.join(get_storage_root(db), "invoices", "signed")


def reports_root(db: Session) -> str:
    return os.path.join(get_storage_root(db), "reports")


def ensure_storage_dirs(db: Session) -> None:
    for path in (invoices_original_root(db), invoices_signed_root(db), reports_root(db)):
        os.makedirs(path, exist_ok=True)


def save_invoice_pdf(db: Session, filename: str, content: bytes, upload_date: date | None = None) -> str:
    """Save a PDF's bytes to disk and return the path it was written to."""
    upload_date = upload_date or date.today()
    target_dir = os.path.join(
        invoices_original_root(db),
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


def save_report_pdf(db: Session, content: bytes, title: str, generated_at: date | None = None) -> str:
    """Save a generated report PDF and return the path it was written to."""
    generated_at = generated_at or date.today()
    target_dir = os.path.join(
        reports_root(db),
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


def human_readable_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def dir_stats(path: str) -> tuple[int, int]:
    """(file_count, total_bytes) for everything under `path`, recursively.
    Returns (0, 0) for a missing directory rather than raising — a fresh
    install's storage subdirectories may not exist yet."""
    if not os.path.isdir(path):
        return 0, 0
    count = 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            count += 1
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return count, total


def check_path_writable(path: str) -> None:
    """Raises OSError/PermissionError if `path` doesn't exist and can't be
    created, or exists but isn't writable."""
    os.makedirs(path, exist_ok=True)
    probe = os.path.join(path, f".keep_track_write_test_{uuid.uuid4().hex}")
    with open(probe, "wb") as f:
        f.write(b"ok")
    os.remove(probe)


def move_storage_root(db: Session, new_root: str) -> dict:
    """Physically moves the "invoices" and "reports" subtrees from the
    current storage root to `new_root`, then rewrites every
    invoice_files.original_path, invoices.signed_pdf_path, and
    reports.file_path that pointed under the old root. Does not touch the
    storage_path setting itself or write an audit entry — the caller
    (routers/storage.py) owns both, alongside the before/after values it
    already has for the audit metadata.

    If a move fails partway through, whichever entries already succeeded are
    moved back before the exception propagates, and no DB rows are touched —
    a raised exception here always means storage_path can stay unchanged.

    Moves each entry *inside* "invoices" and "reports" individually, rather
    than renaming those two directories wholesale — old_root/invoices and
    old_root/reports are themselves Docker volume mount points in the
    default deployment (see docker-compose.yml), and renaming a mount point
    fails with "Device or resource busy". Confirmed directly against a
    running stack: an earlier version of this function did
    shutil.move(old_root/invoices, ...) and hit exactly that OSError. Moving
    the mount point's *contents* out and leaving the (now empty) mount
    point in place avoids the problem entirely. See docs/decisions-log.md.
    """
    from models.invoice import Invoice
    from models.invoice_file import InvoiceFile
    from models.report import Report

    old_root = get_storage_root(db)
    if os.path.abspath(old_root) == os.path.abspath(new_root):
        return {"files_moved": 0, "bytes_moved": 0}

    file_count = 0
    byte_count = 0
    for sub in ("invoices", "reports"):
        c, s = dir_stats(os.path.join(old_root, sub))
        file_count += c
        byte_count += s

    os.makedirs(new_root, exist_ok=True)
    completed: list[tuple[str, str, list[str]]] = []
    try:
        for sub in ("invoices", "reports"):
            src = os.path.join(old_root, sub)
            if not os.path.isdir(src):
                continue
            dst = os.path.join(new_root, sub)
            os.makedirs(dst, exist_ok=True)
            moved_entries = []
            for entry in os.listdir(src):
                shutil.move(os.path.join(src, entry), os.path.join(dst, entry))
                moved_entries.append(entry)
            completed.append((src, dst, moved_entries))
    except Exception:
        for src, dst, moved_entries in completed:
            for entry in moved_entries:
                moved_path = os.path.join(dst, entry)
                if os.path.exists(moved_path):
                    shutil.move(moved_path, os.path.join(src, entry))
        raise

    old_prefix = old_root.rstrip("/")
    new_prefix = new_root.rstrip("/")

    for f in db.query(InvoiceFile).filter(InvoiceFile.original_path.like(f"{old_prefix}/%")).all():
        f.original_path = new_prefix + f.original_path[len(old_prefix):]
    for inv in (
        db.query(Invoice)
        .filter(Invoice.signed_pdf_path.isnot(None), Invoice.signed_pdf_path.like(f"{old_prefix}/%"))
        .all()
    ):
        inv.signed_pdf_path = new_prefix + inv.signed_pdf_path[len(old_prefix):]
    for rep in db.query(Report).filter(Report.file_path.like(f"{old_prefix}/%")).all():
        rep.file_path = new_prefix + rep.file_path[len(old_prefix):]

    db.commit()

    return {"files_moved": file_count, "bytes_moved": byte_count}
