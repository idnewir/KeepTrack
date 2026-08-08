"""Transaction rules endpoints: manage supplier -> category auto-
categorisation rules, preview suggestions drawn from invoice history, and
test a supplier name against the current rule set before saving. See
services/rules_service.py for the matching logic itself.

Not module-gated (no require_module dependency) — rules improve core
invoice processing and are always available. See docs/decisions-log.md.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.category import Category
from models.schemas import (
    TransactionRuleCreate,
    TransactionRuleOut,
    TransactionRuleSuggestionOut,
    TransactionRuleTestRequest,
    TransactionRuleTestResult,
    TransactionRuleUpdate,
)
from models.transaction_rule import TransactionRule
from models.user import User
from services import audit_service, rules_service
from utils.deps import require_admin

router = APIRouter(prefix="/rules", tags=["rules"])


def _rule_to_out(db: Session, rule: TransactionRule) -> dict:
    category = db.get(Category, rule.category_id)
    return {
        "id": rule.id,
        "name": rule.name,
        "match_type": rule.match_type,
        "match_value": rule.match_value,
        "category_id": rule.category_id,
        "category_name": category.name if category else "Unknown category",
        "category_colour": category.colour if category else "#999999",
        "priority": rule.priority,
        "active": rule.active,
        "created_by": rule.created_by,
        "created_at": rule.created_at,
        "updated_at": rule.updated_at,
    }


def _get_rule_or_404(db: Session, rule_id: int) -> TransactionRule:
    rule = db.get(TransactionRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    return rule


def _validate_category(db: Session, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Category not found")


@router.get("", response_model=list[TransactionRuleOut])
def list_rules(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rules = (
        db.query(TransactionRule)
        .order_by(TransactionRule.priority.desc(), TransactionRule.created_at.asc())
        .all()
    )
    return [_rule_to_out(db, r) for r in rules]


@router.get("/suggestions", response_model=list[TransactionRuleSuggestionOut])
def get_suggestions(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return rules_service.get_suggested_rules(db)


@router.post("/test", response_model=TransactionRuleTestResult)
def test_rule(
    payload: TransactionRuleTestRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rule = rules_service.find_matching_rule(db, payload.supplier_name)
    if rule is None:
        return {"matched": False}

    category = db.get(Category, rule.category_id)
    return {
        "matched": True,
        "rule_id": rule.id,
        "rule_name": rule.name,
        "category_id": rule.category_id,
        "category_name": category.name if category else None,
        "category_colour": category.colour if category else None,
    }


@router.post("", response_model=TransactionRuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: TransactionRuleCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if not payload.match_value.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match value cannot be empty")
    _validate_category(db, payload.category_id)

    rule = TransactionRule(
        name=payload.name.strip(),
        match_type=payload.match_type,
        match_value=payload.match_value.strip(),
        category_id=payload.category_id,
        priority=payload.priority,
        active=payload.active,
        created_by=admin.id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    audit_service.log_action(
        db, "rule.created", f"Created transaction rule '{rule.name}'",
        user_id=admin.id, affected_table="transaction_rules", affected_record_id=rule.id,
    )
    return _rule_to_out(db, rule)


@router.put("/{rule_id}", response_model=TransactionRuleOut)
def update_rule(
    rule_id: int,
    payload: TransactionRuleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rule = _get_rule_or_404(db, rule_id)
    changed_fields: dict = {}

    if payload.name is not None and payload.name.strip() and payload.name.strip() != rule.name:
        changed_fields["name"] = {"before": rule.name, "after": payload.name.strip()}
        rule.name = payload.name.strip()

    if payload.match_type is not None and payload.match_type != rule.match_type:
        changed_fields["match_type"] = {"before": rule.match_type, "after": payload.match_type}
        rule.match_type = payload.match_type

    if payload.match_value is not None:
        trimmed = payload.match_value.strip()
        if not trimmed:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match value cannot be empty")
        if trimmed != rule.match_value:
            changed_fields["match_value"] = {"before": rule.match_value, "after": trimmed}
            rule.match_value = trimmed

    if payload.category_id is not None and payload.category_id != rule.category_id:
        _validate_category(db, payload.category_id)
        changed_fields["category_id"] = {"before": rule.category_id, "after": payload.category_id}
        rule.category_id = payload.category_id

    if payload.priority is not None and payload.priority != rule.priority:
        changed_fields["priority"] = {"before": rule.priority, "after": payload.priority}
        rule.priority = payload.priority

    if payload.active is not None and payload.active != rule.active:
        changed_fields["active"] = {"before": rule.active, "after": payload.active}
        rule.active = payload.active

    db.commit()
    db.refresh(rule)

    if changed_fields:
        audit_service.log_action(
            db, "rule.updated", f"Updated transaction rule '{rule.name}' ({', '.join(changed_fields)})",
            user_id=admin.id, affected_table="transaction_rules", affected_record_id=rule.id,
            metadata={"changed_fields": changed_fields},
        )
    return _rule_to_out(db, rule)


@router.delete("/{rule_id}", response_model=TransactionRuleOut)
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Soft delete via the `active` flag — same pattern as
    # DELETE /categories/{id} (routers/categories.py). A deleted rule stops
    # matching immediately (find_matching_rule only considers active rules)
    # but stays visible in GET /rules, marked inactive, rather than being
    # hard-deleted. See docs/decisions-log.md.
    rule = _get_rule_or_404(db, rule_id)
    rule.active = False
    db.commit()
    db.refresh(rule)

    audit_service.log_action(
        db, "rule.deleted", f"Deleted transaction rule '{rule.name}'",
        user_id=admin.id, affected_table="transaction_rules", affected_record_id=rule.id,
    )
    return _rule_to_out(db, rule)


@router.post("/{rule_id}/toggle", response_model=TransactionRuleOut)
def toggle_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rule = _get_rule_or_404(db, rule_id)
    rule.active = not rule.active
    db.commit()
    db.refresh(rule)

    action = "rule.enabled" if rule.active else "rule.disabled"
    audit_service.log_action(
        db, action, f"{'Enabled' if rule.active else 'Disabled'} transaction rule '{rule.name}'",
        user_id=admin.id, affected_table="transaction_rules", affected_record_id=rule.id,
    )
    return _rule_to_out(db, rule)
