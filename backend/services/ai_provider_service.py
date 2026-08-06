"""Unified AI provider abstraction.

Keep Track's two AI features — invoice extraction and report summary
generation — used to call the Anthropic SDK directly (see the old
services/ai_service.py). This module replaces that with a provider-agnostic
layer so the AI provider, model, and credentials are configurable from
Settings -> AI & Extraction rather than hardcoded, while keeping the exact
same two entry points (`extract_invoice_data`, `generate_report_summary`)
and the same graceful-degradation contract: any failure — missing
configuration, a network/API error, an unparsable response — returns the
existing empty/placeholder shape rather than raising, and is logged to
error_log.

Supported providers and how each is called:

- ANTHROPIC: official `anthropic` SDK. The only provider given the PDF
  natively (as a `document` content block) rather than extracted text —
  see `_extract_pdf_text` below for why every other provider gets text.
- OPENAI: official `openai` SDK, Chat Completions API.
- GOOGLE (Gemini): `google-generativeai` SDK.
- XAI (Grok), OLLAMA, and CUSTOM: all OpenAI-compatible — the `openai` SDK
  pointed at a different `base_url` (xAI's public endpoint, a self-hosted
  Ollama instance, or any other OpenAI-compatible server).
- MISTRAL: official `mistralai` SDK.
- COHERE: official `cohere` SDK (ClientV2 chat API).

API key resolution priority (per provider), used everywhere a call is made:
1. The `ai_api_key` setting (encrypted at rest with the app's Fernet key).
2. An environment variable, per-provider (ANTHROPIC_API_KEY, OPENAI_API_KEY,
   GOOGLE_API_KEY, XAI_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY).
3. None — AI features are unavailable for that provider until one is set.

Ollama needs no API key (self-hosted); Custom's key is optional.
"""
import base64
import json
import logging
import os
import re
import time
import traceback
from datetime import date
from decimal import Decimal, InvalidOperation

import fitz
from sqlalchemy.orm import Session

from config import settings as app_config
from models.category import Category
from models.setting import Setting
from models.system_event import SystemEvent
from services import error_service
from services.settings_service import get_reserve_settings, get_terminology
from utils.crypto import decrypt_secret

logger = logging.getLogger("keep_track.ai_provider")

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

CLOUD_PROVIDERS = ("anthropic", "openai", "google", "xai", "mistral", "cohere")
FREE_TEXT_MODEL_PROVIDERS = ("ollama", "custom")
SUPPORTED_PROVIDERS = CLOUD_PROVIDERS + FREE_TEXT_MODEL_PROVIDERS

PROVIDER_LABELS = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "google": "Google Gemini",
    "xai": "xAI Grok",
    "mistral": "Mistral",
    "cohere": "Cohere",
    "ollama": "Ollama (self-hosted)",
    "custom": "Custom (OpenAI-compatible)",
}

# Predefined model catalogue per provider — first entry is the default.
# Ollama and Custom take free-text model names instead (whatever's installed
# on that endpoint), so they have no predefined list.
PROVIDER_MODELS = {
    "anthropic": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    "google": ["gemini-1.5-pro", "gemini-1.5-flash"],
    "xai": ["grok-beta"],
    "mistral": ["mistral-large-latest", "mistral-small-latest"],
    "cohere": ["command-r-plus", "command-r"],
}

XAI_BASE_URL = "https://api.x.ai/v1"

PROVIDER_ENV_KEYS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
    "xai": "XAI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "cohere": "COHERE_API_KEY",
}

DEFAULT_MODEL_FOR_PROVIDER = {p: models[0] for p, models in PROVIDER_MODELS.items()}

AI_TEST_EVENT_TYPE = "ai_test_connection"
# The actual limit is app_config.ai_test_rate_limit (env var
# AI_TEST_RATE_LIMIT, default 60) — see recent_test_count below. The window
# itself (as opposed to the count) isn't exposed as a separate env var; the
# task this was built for only asked for the count to be configurable.
AI_TEST_RATE_LIMIT_WINDOW_HOURS = 1


def requires_api_key(provider: str) -> bool:
    """Every provider except Ollama (self-hosted, no auth) needs a key.
    Custom is optional (some OpenAI-compatible servers require one, some
    don't) so it's not enforced here — a missing key is simply passed
    through as "no auth header"."""
    return provider not in ("ollama",)


def requires_endpoint_url(provider: str) -> bool:
    return provider in FREE_TEXT_MODEL_PROVIDERS


def _setting_value(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row is not None else None


def get_ai_config(db: Session) -> dict:
    """The current AI configuration as stored in Settings, with sane
    fallbacks if a row is somehow missing (mirrors the fallback pattern in
    services/settings_service.py)."""
    provider = _setting_value(db, "ai_provider") or "anthropic"
    if provider not in SUPPORTED_PROVIDERS:
        provider = "anthropic"
    model = _setting_value(db, "ai_model") or DEFAULT_MODEL_FOR_PROVIDER.get(provider)
    endpoint_url = _setting_value(db, "ai_endpoint_url")
    enabled_raw = _setting_value(db, "ai_enabled")
    enabled = True if enabled_raw is None else enabled_raw.lower() == "true"
    return {"provider": provider, "model": model, "endpoint_url": endpoint_url, "enabled": enabled}


def resolve_api_key(db: Session, provider: str) -> tuple[str | None, str]:
    """Returns (api_key, source) where source is 'database', 'environment',
    or 'none'. The database value is the priority — an Admin explicitly
    configuring a key via Settings should always win over whatever env var
    happens to be set."""
    row = db.query(Setting).filter(Setting.key == "ai_api_key").first()
    if row is not None and row.value:
        try:
            return decrypt_secret(row.value), "database"
        except Exception:
            logger.exception("Failed to decrypt stored ai_api_key — treating as unset")

    env_key_name = PROVIDER_ENV_KEYS.get(provider)
    if env_key_name:
        env_value = os.environ.get(env_key_name)
        if env_value:
            return env_value, "environment"

    return None, "none"


def api_key_is_set(db: Session) -> bool:
    row = db.query(Setting).filter(Setting.key == "ai_api_key").first()
    return row is not None and bool(row.value)


# ---------------------------------------------------------------------------
# PDF text extraction (used for every provider except Anthropic)
# ---------------------------------------------------------------------------

def _extract_pdf_text(pdf_bytes: bytes, max_chars: int = 15000) -> str:
    """Plain text extracted from every page of the PDF, via PyMuPDF.

    Anthropic's `document` content block sends the PDF itself (text and
    rendered pages), which reads scanned/image invoices as well as
    text-based ones. Seven different provider SDKs each have their own
    (and differently-shaped) multimodal/file APIs, so supporting native PDF
    input for all of them isn't practical here — extracted text is the one
    approach that works identically across every OpenAI-compatible and
    non-compatible SDK alike. Anthropic keeps native PDF input (see
    `_call_anthropic`) since it's already implemented and is strictly
    higher-quality for scanned invoices.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        text = "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()
    return text[:max_chars]


# ---------------------------------------------------------------------------
# Prompts (shared across all providers)
# ---------------------------------------------------------------------------

EMPTY_EXTRACTION = {
    "invoice_date": None,
    "supplier": None,
    "amount": None,
    "category_id": None,
    "notes": None,
}

EMPTY_REPORT_SUMMARY = {
    "executive_summary": None,
    "key_insights": [],
    "trends_and_anomalies": None,
    "forward_looking_paragraph": None,
}


def _build_extraction_system_prompt(categories: list[Category]) -> str:
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


def _report_use_case(site_name: str, terminology: dict[str, str]) -> str:
    """'personal', 'organisation', or 'default' — drives both the context
    line and the tone instruction given to the AI. Terminology is checked
    first since it's an explicit, deterministic signal (income label
    'Income' + expenses label 'Bills'/'Expenses' is exactly the pairing a
    personal-finance user would pick in Settings); site_name is only a
    fallback since detecting "this looks like an organisation's name" from
    free text is inherently fuzzy — a customised, non-default site_name is
    treated as organisational context."""
    income_label = (terminology.get("term_income") or "").strip().lower()
    expenses_label = (terminology.get("term_expenses") or "").strip().lower()
    if income_label == "income" and expenses_label in ("bills", "expenses"):
        return "personal"
    if site_name and site_name.strip().lower() != "keep track":
        return "organisation"
    return "default"


def _report_context_line(use_case: str, site_name: str) -> str:
    if use_case == "personal":
        return "This report is for a personal finance tracker."
    if use_case == "organisation":
        return f"This report is for {site_name}, an organisation using Keep Track to manage its running costs."
    return f"This report is for {site_name} using Keep Track."


def _build_report_system_prompt(site_name: str, terminology: dict[str, str], reserve: dict) -> str:
    """Builds the report-narration system prompt around this deployment's
    own terminology settings (Settings -> Terminology) rather than
    hardcoded charity/invoice language, so the same code produces a report
    that reads naturally whether Keep Track is tracking a charity's
    invoices, a business's expenses, or a household's bills."""
    term_expenses = terminology["term_expenses"]
    term_income = terminology["term_income"]
    term_projects = terminology["term_projects"]
    term_reserve = terminology["term_reserve"]

    use_case = _report_use_case(site_name, terminology)
    context_line = _report_context_line(use_case, site_name)

    if use_case == "personal":
        tone = (
            f"Write in a friendly, conversational, second-person tone (\"your "
            f"{term_expenses.lower()}\", \"your {term_reserve.lower()}\") as if talking "
            "directly to the person who owns these accounts."
        )
    else:
        tone = (
            "Write in a formal, third-person tone suitable for trustees or "
            "stakeholders reviewing the organisation's accounts."
        )

    reserve_note = ""
    if reserve["calculation"] == "automatic":
        reserve_note = (
            f" The {term_reserve.lower()} is calculated automatically as "
            f"{reserve['months']} months of average spend."
        )

    return (
        "You are writing the narrative section of a financial report generated by "
        f"Keep Track. {context_line}{reserve_note} The report's figures have already "
        "been calculated — your job is only to explain them in plain English.\n\n"
        "Use this deployment's own terminology consistently and naturally throughout: "
        f"call spending items '{term_expenses}', money received '{term_income}', "
        f"planned initiatives '{term_projects}', and the savings buffer the "
        f"'{term_reserve}'.\n\n"
        f"{tone} Always write for a non-technical audience — avoid jargon, do not "
        "restate every figure verbatim (the report already shows tables and charts "
        "alongside your text), and do not invent any numbers not present in the data "
        f"given to you. If any {term_projects.lower()} in the data is significantly over "
        "or under its estimated cost, call it out by name — this is one of the most "
        "useful things trustees or stakeholders can learn from this report.\n\n"
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


def _format_currency(amount) -> str:
    return f"£{Decimal(amount or 0):,.2f}"


def _build_report_context(report_data: dict, site_name: str, terminology: dict[str, str]) -> str:
    """Render the pre-calculated report figures as plain text for the prompt."""
    term_expenses = terminology["term_expenses"]
    term_income = terminology["term_income"]
    term_projects = terminology["term_projects"]

    lines = [
        f"Site: {site_name}",
        f"Reporting period: {report_data['date_from']} to {report_data['date_to']} "
        f"({report_data['report_type']} report)",
        "Categories included: "
        + (", ".join(c["name"] for c in report_data["categories"]) or "All categories"),
        "",
        f"Total confirmed spend in period: {_format_currency(report_data['total_spend'])} "
        f"across {report_data['invoice_count']} {term_expenses.lower()}",
        f"Total {term_income.lower()} received in period: {_format_currency(report_data['total_income'])}",
        f"Net position for the period ({term_income.lower()} − {term_expenses.lower()}): "
        f"{_format_currency(report_data['net_position'])}",
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
        lines.append(f"Planned {term_projects.lower()} due in this period (estimated vs. actual spend so far):")
        for p in report_data["planned_projects"]:
            variance_note = (
                f", {_format_currency(abs(p['variance']))} "
                f"{'under' if p['variance'] >= 0 else 'over'} budget"
                if p["actual_cost"]
                else ""
            )
            lines.append(
                f"- {p['name']}: estimated {_format_currency(p['estimated_cost'])}, "
                f"actual {_format_currency(p['actual_cost'])}{variance_note}, expected {p['expected_month_label']}"
            )

    funding = report_data.get("funding_position")
    if funding:
        lines.append("")
        lines.append("Funding position:")
        if funding["financial_year_label"]:
            lines.append(f"- Financial year: {funding['financial_year_label']}")
        if funding["opening_balance"] is not None:
            lines.append(f"- Opening balance: {_format_currency(funding['opening_balance'])}")
        lines.append(f"- {term_income} in period: {_format_currency(funding['total_contributions'])}")
        lines.append(f"- Spend in period: {_format_currency(funding['total_spend'])}")
        lines.append(f"- Net position: {_format_currency(funding['net_position'])}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Per-provider call implementations. Each raises on failure — callers catch
# broadly and degrade gracefully, since a provider SDK's own exception
# hierarchy isn't something this module should have to track exhaustively.
# ---------------------------------------------------------------------------

def _call_anthropic(api_key: str, model: str, system_prompt: str, pdf_bytes: bytes | None, user_text: str) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    if pdf_bytes is not None:
        content = [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(pdf_bytes).decode("ascii"),
                },
            },
            {"type": "text", "text": user_text},
        ]
    else:
        content = user_text

    response = client.messages.create(
        model=model,
        max_tokens=1536,
        system=system_prompt,
        messages=[{"role": "user", "content": content}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


def _call_openai_compatible(api_key: str | None, model: str, base_url: str | None, system_prompt: str, user_text: str) -> str:
    """OpenAI Chat Completions — used for OpenAI itself, xAI Grok, Ollama,
    and any Custom OpenAI-compatible endpoint."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key or "not-required", base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        max_tokens=1536,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
    )
    return response.choices[0].message.content or ""


def _call_google(api_key: str, model: str, system_prompt: str, user_text: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model_obj = genai.GenerativeModel(model_name=model, system_instruction=system_prompt)
    response = model_obj.generate_content(user_text)
    return response.text or ""


def _call_mistral(api_key: str, model: str, system_prompt: str, user_text: str) -> str:
    from mistralai import Mistral

    client = Mistral(api_key=api_key)
    response = client.chat.complete(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
    )
    return response.choices[0].message.content or ""


def _call_cohere(api_key: str, model: str, system_prompt: str, user_text: str) -> str:
    import cohere

    client = cohere.ClientV2(api_key=api_key)
    response = client.chat(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
    )
    parts = getattr(response.message, "content", None) or []
    return "".join(getattr(p, "text", "") for p in parts)


def _dispatch_text_call(provider: str, api_key: str | None, model: str, endpoint_url: str | None, system_prompt: str, user_text: str) -> str:
    if provider == "openai":
        return _call_openai_compatible(api_key, model, None, system_prompt, user_text)
    if provider == "xai":
        return _call_openai_compatible(api_key, model, XAI_BASE_URL, system_prompt, user_text)
    if provider == "ollama":
        base_url = f"{(endpoint_url or '').rstrip('/')}/v1"
        return _call_openai_compatible(api_key, model, base_url, system_prompt, user_text)
    if provider == "custom":
        return _call_openai_compatible(api_key, model, endpoint_url, system_prompt, user_text)
    if provider == "google":
        return _call_google(api_key, model, system_prompt, user_text)
    if provider == "mistral":
        return _call_mistral(api_key, model, system_prompt, user_text)
    if provider == "cohere":
        return _call_cohere(api_key, model, system_prompt, user_text)
    raise ValueError(f"Unsupported provider: {provider}")


# ---------------------------------------------------------------------------
# Config/eligibility checks shared by every entry point
# ---------------------------------------------------------------------------

class _AIUnavailable(Exception):
    """Raised internally when AI can't be used at all (disabled, no key, no
    endpoint) — caught once per entry point so each one's "why did this
    come back empty" logging stays in one place."""


def _check_available(db: Session, cfg: dict) -> tuple[str | None, str]:
    if not cfg["enabled"]:
        raise _AIUnavailable("AI features are disabled in Settings")

    api_key, source = resolve_api_key(db, cfg["provider"])
    if requires_api_key(cfg["provider"]) and not api_key:
        raise _AIUnavailable(f"No API key configured for provider '{cfg['provider']}'")

    if requires_endpoint_url(cfg["provider"]) and not cfg["endpoint_url"]:
        raise _AIUnavailable(f"No endpoint URL configured for provider '{cfg['provider']}'")

    if not cfg["model"]:
        raise _AIUnavailable("No model configured")

    return api_key, source


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def extract_invoice_data(pdf_bytes: bytes, categories: list[Category], db: Session | None = None) -> dict:
    """Extract invoice_date, supplier, amount, category_id, and notes from a
    PDF using the currently configured AI provider. Falls back to empty
    fields — never raises — on any failure, per docs/features.md: "If
    extraction fails or is uncertain, return the fields as empty so the
    user can fill manually.\""""
    if db is None:
        return dict(EMPTY_EXTRACTION)

    cfg = get_ai_config(db)
    try:
        api_key, _source = _check_available(db, cfg)
    except _AIUnavailable as exc:
        logger.warning("AI extraction skipped: %s", exc)
        error_service.log_error(db, "warning", "ai_extraction", f"AI extraction skipped: {exc}")
        return dict(EMPTY_EXTRACTION)

    system_prompt = _build_extraction_system_prompt(categories)

    try:
        if cfg["provider"] == "anthropic":
            text = _call_anthropic(
                api_key, cfg["model"], system_prompt, pdf_bytes,
                "Extract the invoice data as instructed and respond with only the JSON object.",
            )
        else:
            pdf_text = _extract_pdf_text(pdf_bytes)
            user_text = (
                "Here is the text extracted from an invoice PDF:\n\n"
                f"{pdf_text}\n\n"
                "Extract the invoice data as instructed and respond with only the JSON object."
            )
            text = _dispatch_text_call(cfg["provider"], api_key, cfg["model"], cfg["endpoint_url"], system_prompt, user_text)
    except Exception as exc:
        logger.exception("AI provider call failed during invoice extraction (provider=%s)", cfg["provider"])
        error_service.log_error(
            db, "error", "ai_extraction",
            f"AI provider call failed during invoice extraction (provider={cfg['provider']}): {exc}",
            stack_trace=traceback.format_exc(),
        )
        return dict(EMPTY_EXTRACTION)

    return _parse_extraction_response(text, db)


def _parse_extraction_response(text: str, db: Session | None = None) -> dict:
    cleaned = _JSON_FENCE_RE.sub("", text.strip()).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Could not parse AI extraction response as JSON: %r", text[:500])
        if db is not None:
            error_service.log_error(db, "warning", "ai_extraction", "Could not parse AI extraction response as JSON")
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


def generate_report_summary(report_data: dict, site_name: str, db: Session | None = None) -> dict:
    """Ask the currently configured AI provider to narrate a report's
    pre-calculated figures for a general audience. Falls back to
    EMPTY_REPORT_SUMMARY on any failure, matching the same
    graceful-degradation contract as extract_invoice_data."""
    if db is None:
        return dict(EMPTY_REPORT_SUMMARY)

    cfg = get_ai_config(db)
    try:
        api_key, _source = _check_available(db, cfg)
    except _AIUnavailable as exc:
        logger.warning("AI report summary skipped: %s", exc)
        error_service.log_error(db, "warning", "ai_report_summary", f"AI report summary skipped: {exc}")
        return dict(EMPTY_REPORT_SUMMARY)

    terminology = get_terminology(db)
    reserve = get_reserve_settings(db)
    system_prompt = _build_report_system_prompt(site_name, terminology, reserve)
    context = _build_report_context(report_data, site_name, terminology)
    user_text = (
        "Here is the calculated data for this report:\n\n"
        f"{context}\n\n"
        "Write the executive summary, key insights, trends/anomalies note, "
        "and forward-looking paragraph as instructed, and respond with only "
        "the JSON object."
    )

    try:
        if cfg["provider"] == "anthropic":
            text = _call_anthropic(api_key, cfg["model"], system_prompt, None, user_text)
        else:
            text = _dispatch_text_call(cfg["provider"], api_key, cfg["model"], cfg["endpoint_url"], system_prompt, user_text)
    except Exception as exc:
        logger.exception("AI provider call failed during report summary generation (provider=%s)", cfg["provider"])
        error_service.log_error(
            db, "error", "ai_report_summary",
            f"AI provider call failed during report summary generation (provider={cfg['provider']}): {exc}",
            stack_trace=traceback.format_exc(),
        )
        return dict(EMPTY_REPORT_SUMMARY)

    return _parse_report_summary_response(text, db)


def _parse_report_summary_response(text: str, db: Session | None = None) -> dict:
    cleaned = _JSON_FENCE_RE.sub("", text.strip()).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Could not parse AI report summary response as JSON: %r", text[:500])
        if db is not None:
            error_service.log_error(db, "warning", "ai_report_summary", "Could not parse AI report summary response as JSON")
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


# ---------------------------------------------------------------------------
# Test connection (POST /ai/test) and model listing (GET /ai/models)
# ---------------------------------------------------------------------------

def test_connection(db: Session) -> dict:
    """Sends a trivial prompt to the currently configured provider and times
    the round trip. Never raises — every failure path (misconfiguration,
    network error, API error) comes back as {success: False, error: ...}
    for the endpoint to return as a normal 200 response."""
    cfg = get_ai_config(db)

    try:
        api_key, _source = _check_available(db, cfg)
    except _AIUnavailable as exc:
        return {"success": False, "response_time_ms": None, "model_used": cfg["model"], "error": str(exc)}

    start = time.monotonic()
    try:
        if cfg["provider"] == "anthropic":
            _call_anthropic(api_key, cfg["model"], "You are a connection test.", None, "Reply with exactly: OK")
        else:
            _dispatch_text_call(
                cfg["provider"], api_key, cfg["model"], cfg["endpoint_url"],
                "You are a connection test.", "Reply with exactly: OK",
            )
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {"success": False, "response_time_ms": elapsed_ms, "model_used": cfg["model"], "error": str(exc)[:500]}

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return {"success": True, "response_time_ms": elapsed_ms, "model_used": cfg["model"], "error": None}


def list_models_for_provider(provider: str, endpoint_url: str | None = None) -> dict:
    """The predefined model catalogue for a provider, or (for Ollama) a
    live-fetched list from the endpoint's /api/tags — falling back to an
    empty list with an explanatory note if the endpoint isn't reachable."""
    if provider == "ollama":
        if not endpoint_url:
            return {"models": [], "note": "Set an endpoint URL to list installed Ollama models."}
        try:
            import httpx

            resp = httpx.get(f"{endpoint_url.rstrip('/')}/api/tags", timeout=3.0)
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", []) if "name" in m]
            if not models:
                return {"models": [], "note": "No models found on this Ollama endpoint."}
            return {"models": models, "note": None}
        except Exception:
            return {"models": [], "note": "Could not reach the Ollama endpoint to list models."}

    if provider == "custom":
        return {"models": [], "note": "Enter the model name manually for custom endpoints."}

    if provider in PROVIDER_MODELS:
        return {"models": PROVIDER_MODELS[provider], "note": None}

    return {"models": [], "note": "Unknown provider."}


def list_all_provider_models(db: Session, ollama_endpoint_url: str | None = None) -> dict:
    """GET /ai/models's payload: every provider's model catalogue, keyed by
    provider id. `ollama_endpoint_url` lets the frontend pass an
    in-progress (not-yet-saved) endpoint URL for a live Ollama lookup;
    otherwise the currently saved ai_endpoint_url setting is used."""
    endpoint_url = ollama_endpoint_url or _setting_value(db, "ai_endpoint_url")
    return {provider: list_models_for_provider(provider, endpoint_url) for provider in SUPPORTED_PROVIDERS}


# ---------------------------------------------------------------------------
# Test-connection rate limiting (app_config.ai_test_rate_limit per hour per
# user) — reuses the system_events table (see models/system_event.py), the
# same "lightweight, permanent, DB-backed attempt counter" mechanism
# services/system_reset_service.py already established for POST
# /system/reset's own rate limit. Not written to audit_log — the task brief
# calls that "too noisy" for a routine connectivity check.
# ---------------------------------------------------------------------------

def recent_test_count(db: Session, user_id: int) -> int:
    from datetime import datetime, timedelta, timezone

    window_start = datetime.now(timezone.utc) - timedelta(hours=AI_TEST_RATE_LIMIT_WINDOW_HOURS)
    return (
        db.query(SystemEvent)
        .filter(
            SystemEvent.event_type == AI_TEST_EVENT_TYPE,
            # Scoped to one real, authenticated user (never NULL) — the only
            # caller of log_test_event is POST /ai/test, gated by
            # require_admin, so this count only ever reflects a human clicking
            # "Test connection." Nothing at app startup or in a background
            # task logs this event type; performed_by.isnot(None) makes that
            # exclusion explicit and structural rather than incidental, so a
            # future system-triggered caller (if one is ever added, logging
            # with performed_by=None) can't inflate a user's own count.
            SystemEvent.performed_by.isnot(None),
            SystemEvent.performed_by == user_id,
            SystemEvent.created_at >= window_start,
        )
        .count()
    )


def log_test_event(db: Session, user_id: int, details: dict) -> None:
    db.add(SystemEvent(event_type=AI_TEST_EVENT_TYPE, performed_by=user_id, details=details))
    db.commit()
