"""Full text search across invoices, contributions, and planned projects.

See services/search_service.py for the actual PostgreSQL text-search
queries this thin router just calls and assembles into the grouped
response shape.
"""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import SearchResponse
from models.user import User
from services import audit_service, search_service
from utils.deps import get_current_user
from utils.pagination import MAX_PER_PAGE

router = APIRouter(prefix="/search", tags=["search"])

# The contributions/projects sections aren't independently paginated on the
# full results page (see docs/decisions-log.md) — capped at a generous but
# bounded number of top-ranked matches instead of a real page/per_page.
_SECONDARY_SECTION_LIMIT = 50


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=search_service.MIN_QUERY_LENGTH, max_length=200),
    type: Literal["invoices", "all"] = "all",
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    page = max(1, page)
    per_page = max(1, min(per_page, MAX_PER_PAGE))

    invoice_results, invoice_total = search_service.search_invoices(db, q, page, per_page)
    total_pages = -(-invoice_total // per_page) if invoice_total else 0
    invoices_section = {
        "total": invoice_total,
        "results": invoice_results,
        "pagination": {
            "page": min(page, total_pages) if total_pages else 1,
            "per_page": per_page,
            "total_records": invoice_total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1,
        },
    }

    if type == "invoices":
        # Skips the two extra queries entirely rather than just hiding
        # their results — this mode exists specifically so a client that
        # only wants invoices (e.g. paging deep into a large invoice-only
        # result set) doesn't pay for work it's going to discard.
        contributions_section = {"total": 0, "results": []}
        projects_section = {"total": 0, "results": []}
    else:
        contribution_results, contribution_total = search_service.search_contributions(
            db, q, _SECONDARY_SECTION_LIMIT
        )
        project_results, project_total = search_service.search_projects(db, q, _SECONDARY_SECTION_LIMIT)
        contributions_section = {"total": contribution_total, "results": contribution_results}
        projects_section = {"total": project_total, "results": project_results}

    overall_total = invoices_section["total"] + contributions_section["total"] + projects_section["total"]

    # Logged on every call, including the debounced instant-results dropdown
    # firing mid-keystroke — not just a final Enter-triggered search — per
    # the task brief's literal "search.performed — query: [term], results:
    # X" requirement. See docs/decisions-log.md for the volume tradeoff this
    # implies (a single typed word can log several partial-query entries).
    audit_service.log_action(
        db, "search.performed", f"'{user.username}' searched — query: '{q}', results: {overall_total}",
        user_id=user.id,
    )

    return {
        "invoices": invoices_section,
        "contributions": contributions_section,
        "projects": projects_section,
        "query": q,
        "total": overall_total,
    }
