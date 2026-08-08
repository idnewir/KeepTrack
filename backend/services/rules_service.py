"""Transaction rules: supplier-name -> category auto-categorisation.

apply_rules() is called from services/ai_provider_service.py (after AI
extraction, so a rule can override the AI's own category guess) and from
routers/imports.py (CSV import, which has no AI step at all — rules are the
only automatic categorisation there). Both paths mean a rule takes effect
identically whether AI is enabled, disabled, or not configured. See
docs/decisions-log.md for why rules always win over an AI suggestion.
"""
from collections import Counter

from sqlalchemy.orm import Session

from models.audit_log import AuditLog
from models.category import Category
from models.invoice import Invoice
from models.transaction_rule import TransactionRule

# A supplier is only suggested once at least this many manually-recategorised
# invoices agree on the same final category — a single edit is too weak a
# signal for "usually categorised as X". See docs/decisions-log.md.
MIN_SUGGESTION_OCCURRENCES = 2
MAX_SUGGESTIONS = 10


def _matches(rule: TransactionRule, supplier_name: str) -> bool:
    supplier = supplier_name.lower()
    value = rule.match_value.lower()
    if rule.match_type == "exact":
        return supplier == value
    if rule.match_type == "starts_with":
        return supplier.startswith(value)
    return value in supplier  # "contains" — also the fallback for any unrecognised match_type


def find_matching_rule(db: Session, supplier_name: str | None) -> TransactionRule | None:
    """The highest-priority active rule whose match_value matches
    `supplier_name` (case-insensitive), or None. Ties in priority are broken
    by id for deterministic results."""
    if not supplier_name or not supplier_name.strip():
        return None

    rules = (
        db.query(TransactionRule)
        .filter(TransactionRule.active.is_(True))
        .order_by(TransactionRule.priority.desc(), TransactionRule.id.asc())
        .all()
    )
    for rule in rules:
        if _matches(rule, supplier_name):
            return rule
    return None


def apply_rules(db: Session, supplier_name: str | None) -> int | None:
    """The category_id of the first (highest-priority) active rule matching
    `supplier_name`, or None if no rule matches."""
    rule = find_matching_rule(db, supplier_name)
    return rule.category_id if rule else None


def get_suggested_rules(db: Session) -> list[dict]:
    """Suggests new rules from invoices whose category was manually changed
    after creation — PUT /invoices/{id} logs an 'invoice.edited' audit entry
    with 'category_id' in its changed_fields whenever that happens (see
    routers/invoices.py) — grouped by supplier and their most common final
    category. Suppliers already covered by an active rule are skipped."""
    edited_logs = (
        db.query(AuditLog)
        .filter(AuditLog.action_type == "invoice.edited", AuditLog.affected_table == "invoices")
        .all()
    )
    recategorised_ids = {
        log.affected_record_id
        for log in edited_logs
        if log.affected_record_id is not None
        and log.extra_metadata
        and "category_id" in (log.extra_metadata.get("changed_fields") or {})
    }
    if not recategorised_ids:
        return []

    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.id.in_(recategorised_ids),
            Invoice.deleted.is_(False),
            Invoice.category_id.isnot(None),
        )
        .all()
    )

    by_supplier: dict[str, Counter] = {}
    display_name: dict[str, str] = {}
    for invoice in invoices:
        supplier = (invoice.supplier or "").strip()
        if not supplier:
            continue
        key = supplier.lower()
        display_name.setdefault(key, supplier)
        by_supplier.setdefault(key, Counter())[invoice.category_id] += 1

    categories = {c.id: c for c in db.query(Category).all()}

    suggestions = []
    for key, counter in by_supplier.items():
        supplier = display_name[key]
        if find_matching_rule(db, supplier) is not None:
            continue  # already covered by an existing active rule

        category_id, count = counter.most_common(1)[0]
        if count < MIN_SUGGESTION_OCCURRENCES:
            continue
        category = categories.get(category_id)
        if category is None:
            continue

        suggestions.append({
            "supplier": supplier,
            "category_id": category_id,
            "category_name": category.name,
            "category_colour": category.colour,
            "occurrence_count": count,
        })

    suggestions.sort(key=lambda s: s["occurrence_count"], reverse=True)
    return suggestions[:MAX_SUGGESTIONS]
