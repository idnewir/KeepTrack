"""AI-powered invoice extraction and duplicate detection via the Anthropic API.

Sends the uploaded PDF to Claude as a base64 document content block and asks
for a single JSON object back. Structured outputs (output_config.format)
aren't used here because the configured model (claude-sonnet-4-6) doesn't
support them — instead the prompt asks for raw JSON and the response is
parsed defensively. Any failure (API error, unparsable response, missing
field) degrades to empty fields rather than raising, per docs/features.md:
"If extraction fails or is uncertain, return the fields as empty so the
user can fill manually."
"""
import base64
import logging
import json
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

import anthropic
from sqlalchemy.orm import Session

from config import settings
from models.category import Category
from models.invoice import Invoice

logger = logging.getLogger("keep_track.ai")

_client: anthropic.Anthropic | None = None

EMPTY_EXTRACTION = {
    "invoice_date": None,
    "supplier": None,
    "amount": None,
    "category_id": None,
    "notes": None,
}

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _build_system_prompt(categories: list[Category]) -> str:
    category_list = "\n".join(f"- {c.id}: {c.name}" for c in categories) or "(no categories configured)"
    return (
        "You are reading an invoice for a UK-based organisation's bookkeeping system. "
        "Extract the invoice date, supplier name, and total amount due. The amount MUST "
        "be the final total payable, INCLUSIVE OF VAT — not the subtotal before VAT, and "
        "not any partial or per-item figure.\n\n"
        "Match the invoice to the single best category from the list below, by its id. "
        "If nothing fits well, use null for category_id rather than guessing.\n\n"
        f"Available categories (id: name):\n{category_list}\n\n"
        "If any field cannot be determined with reasonable confidence from the document, "
        "use null for that field. Do not invent or estimate data that is not present in "
        "the document.\n\n"
        "Respond with ONLY a single JSON object — no markdown code fences, no commentary "
        "before or after it — matching exactly this shape:\n"
        '{"invoice_date": "YYYY-MM-DD" or null, "supplier": "string" or null, '
        '"amount": "123.45" or null, "category_id": <integer> or null, '
        '"notes": "string" or null}\n\n'
        "The \"notes\" field should briefly capture anything else on the invoice worth "
        "recording (e.g. account/reference number, service period, meter reading), or "
        "null if there is nothing notable."
    )


def extract_invoice_data(pdf_bytes: bytes, categories: list[Category]) -> dict:
    """Extract invoice_date, supplier, amount, category_id, and notes from a PDF."""
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set; skipping AI extraction")
        return dict(EMPTY_EXTRACTION)

    try:
        pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("ascii")
        response = _get_client().messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=_build_system_prompt(categories),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Extract the invoice data as instructed and respond with only the JSON object.",
                        },
                    ],
                }
            ],
        )
    except Exception:
        logger.exception("Anthropic API call failed during invoice extraction")
        return dict(EMPTY_EXTRACTION)

    text = "".join(block.text for block in response.content if block.type == "text")
    return _parse_extraction_response(text)


def _parse_extraction_response(text: str) -> dict:
    cleaned = _JSON_FENCE_RE.sub("", text.strip()).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Could not parse AI extraction response as JSON: %r", text[:500])
        return dict(EMPTY_EXTRACTION)

    if not isinstance(data, dict):
        return dict(EMPTY_EXTRACTION)

    result = dict(EMPTY_EXTRACTION)

    invoice_date = data.get("invoice_date")
    if isinstance(invoice_date, str):
        try:
            result["invoice_date"] = date.fromisoformat(invoice_date)
        except ValueError:
            pass

    supplier = data.get("supplier")
    if isinstance(supplier, str) and supplier.strip():
        result["supplier"] = supplier.strip()

    amount = data.get("amount")
    if amount is not None:
        try:
            result["amount"] = Decimal(str(amount))
        except (InvalidOperation, ValueError):
            pass

    category_id = data.get("category_id")
    if isinstance(category_id, int) and not isinstance(category_id, bool):
        result["category_id"] = category_id

    notes = data.get("notes")
    if isinstance(notes, str) and notes.strip():
        result["notes"] = notes.strip()

    return result


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
