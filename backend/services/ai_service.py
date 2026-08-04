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


EMPTY_REPORT_SUMMARY = {
    "executive_summary": None,
    "key_insights": [],
    "trends_and_anomalies": None,
    "forward_looking_paragraph": None,
}


def _format_currency(amount) -> str:
    return f"£{Decimal(amount or 0):,.2f}"


def _build_report_context(report_data: dict, site_name: str) -> str:
    """Render the pre-calculated report figures as plain text for the prompt.

    A formatted digest reads far more reliably for the model than a raw JSON
    dump of Decimals/dates, and keeps the prompt shorter — the AI is asked to
    interpret and narrate numbers that report_service has already computed,
    not to do arithmetic itself.
    """
    lines = [
        f"Site: {site_name}",
        f"Reporting period: {report_data['date_from']} to {report_data['date_to']} "
        f"({report_data['report_type']} report)",
        "Categories included: "
        + (", ".join(c["name"] for c in report_data["categories"]) or "All categories"),
        "",
        f"Total confirmed spend in period: {_format_currency(report_data['total_spend'])} "
        f"across {report_data['invoice_count']} invoices",
        f"Total contributions received in period: {_format_currency(report_data['total_income'])}",
        f"Net position for the period (income − spend): {_format_currency(report_data['net_position'])}",
        f"Average monthly spend (elapsed months only): {_format_currency(report_data['monthly_average_spend'])}",
    ]

    if report_data["category_breakdown"]:
        lines.append("")
        lines.append("Spend by category in this period:")
        for row in report_data["category_breakdown"]:
            lines.append(
                f"- {row['category_name']}: {_format_currency(row['total'])} "
                f"({row['percent_of_total']:.1f}% of total)"
            )

    if report_data["annual_totals"]:
        lines.append("")
        lines.append(f"Annual totals, last {report_data['years_included']} financial year(s):")
        for row in report_data["annual_totals"]:
            change = (
                f", {row['yoy_change_percent']:+.1f}% vs. previous year"
                if row["yoy_change_percent"] is not None
                else ""
            )
            lines.append(f"- {row['label']}: {_format_currency(row['total'])}{change}")

    forecast = report_data.get("forecast") or {}
    if forecast.get("months"):
        lines.append("")
        lines.append("Forecast for the remaining months in this period:")
        for row in forecast["months"]:
            note = (
                f" (includes {_format_currency(row['planned_project_cost'])} of planned project spend)"
                if row["planned_project_cost"]
                else ""
            )
            lines.append(f"- {row['month_label']}: {_format_currency(row['forecast_spend'])}{note}")

    if report_data["planned_projects"]:
        lines.append("")
        lines.append("Planned projects due in this period:")
        for p in report_data["planned_projects"]:
            lines.append(f"- {p['name']}: {_format_currency(p['estimated_cost'])}, expected {p['expected_month_label']}")

    funding = report_data.get("funding_position")
    if funding:
        lines.append("")
        lines.append("Funding position:")
        if funding["financial_year_label"]:
            lines.append(f"- Financial year: {funding['financial_year_label']}")
        if funding["opening_balance"] is not None:
            lines.append(f"- Opening balance: {_format_currency(funding['opening_balance'])}")
        lines.append(f"- Contributions in period: {_format_currency(funding['total_contributions'])}")
        lines.append(f"- Spend in period: {_format_currency(funding['total_spend'])}")
        lines.append(f"- Net position: {_format_currency(funding['net_position'])}")

    return "\n".join(lines)


_REPORT_SYSTEM_PROMPT = (
    "You are writing the narrative section of a financial report for a small UK "
    "charity or community organisation's bookkeeping system, Keep Track. The "
    "report's figures have already been calculated — your job is only to explain "
    "them in plain English.\n\n"
    "Write for a non-technical audience: trustees, committee members, or a family "
    "reviewing household accounts. Avoid jargon, do not restate every figure "
    "verbatim (the report already shows tables and charts alongside your text), "
    "and do not invent any numbers not present in the data given to you.\n\n"
    "Respond with ONLY a single JSON object — no markdown code fences, no "
    "commentary before or after it — matching exactly this shape:\n"
    '{"executive_summary": "2-3 paragraphs as one string, paragraphs separated by '
    '\\n\\n", "key_insights": ["insight 1", "insight 2", "insight 3"], '
    '"trends_and_anomalies": "a short paragraph noting any significant trends or '
    'anomalies, or null if nothing stands out", "forward_looking_paragraph": "a '
    "short paragraph looking ahead based on the forecast data given, or null if no "
    'forecast data was provided"}\n\n'
    "\"key_insights\" must contain exactly 3 short, specific strings — the top 3 "
    "things worth knowing from this data."
)


def generate_report_summary(report_data: dict, site_name: str) -> dict:
    """Ask Claude to narrate a report's pre-calculated figures for a general audience.

    Any failure (no API key, API error, unparsable response) degrades to
    EMPTY_REPORT_SUMMARY rather than raising, so a report can still be generated
    (with the AI sections simply left blank) if the AI call doesn't succeed —
    matching the same graceful-degradation rule invoice extraction follows.
    """
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set; skipping AI report summary")
        return dict(EMPTY_REPORT_SUMMARY)

    context = _build_report_context(report_data, site_name)

    try:
        response = _get_client().messages.create(
            model=settings.anthropic_model,
            max_tokens=1536,
            system=_REPORT_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Here is the calculated data for this report:\n\n"
                        f"{context}\n\n"
                        "Write the executive summary, key insights, trends/anomalies note, "
                        "and forward-looking paragraph as instructed, and respond with only "
                        "the JSON object."
                    ),
                }
            ],
        )
    except Exception:
        logger.exception("Anthropic API call failed during report summary generation")
        return dict(EMPTY_REPORT_SUMMARY)

    text = "".join(block.text for block in response.content if block.type == "text")
    return _parse_report_summary_response(text)


def _parse_report_summary_response(text: str) -> dict:
    cleaned = _JSON_FENCE_RE.sub("", text.strip()).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Could not parse AI report summary response as JSON: %r", text[:500])
        return dict(EMPTY_REPORT_SUMMARY)

    if not isinstance(data, dict):
        return dict(EMPTY_REPORT_SUMMARY)

    result = dict(EMPTY_REPORT_SUMMARY)

    summary = data.get("executive_summary")
    if isinstance(summary, str) and summary.strip():
        result["executive_summary"] = summary.strip()

    insights = data.get("key_insights")
    if isinstance(insights, list):
        result["key_insights"] = [str(i).strip() for i in insights if isinstance(i, str) and i.strip()][:3]

    trends = data.get("trends_and_anomalies")
    if isinstance(trends, str) and trends.strip():
        result["trends_and_anomalies"] = trends.strip()

    forward = data.get("forward_looking_paragraph")
    if isinstance(forward, str) and forward.strip():
        result["forward_looking_paragraph"] = forward.strip()

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
