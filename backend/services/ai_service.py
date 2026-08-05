"""Duplicate-invoice detection.

AI-powered invoice extraction and report summary generation used to live
here as direct Anthropic API calls. They now live in
services/ai_provider_service.py, which abstracts over multiple configurable
AI providers (see docs/decisions-log.md) — routers/invoices.py and
routers/reports.py import extract_invoice_data / generate_report_summary
from there. check_duplicate stays here since it's an ordinary database
query, not an AI call, and imports it purely for the Invoice model.
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from models.invoice import Invoice


def check_duplicate(
    db: Session,
    supplier: str | None,
    amount: Decimal | None,
    invoice_date: date | None,
) -> bool:
    """Flag likely duplicates: same supplier, a close amount, and a nearby date."""
    if not supplier or amount is None or invoice_date is None:
        return False

    window_start = invoice_date - timedelta(days=7)
    window_end = invoice_date + timedelta(days=7)
    amount_tolerance = max(amount * Decimal("0.02"), Decimal("1.00"))

    candidates = (
        db.query(Invoice)
        .filter(Invoice.deleted.is_(False))
        .filter(Invoice.invoice_date >= window_start)
        .filter(Invoice.invoice_date <= window_end)
        .filter(Invoice.amount >= amount - amount_tolerance)
        .filter(Invoice.amount <= amount + amount_tolerance)
        .all()
    )

    supplier_normalised = supplier.strip().lower()
    return any((c.supplier or "").strip().lower() == supplier_normalised for c in candidates)
