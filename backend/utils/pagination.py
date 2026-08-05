"""Shared offset-based pagination for list endpoints.

Query params are `page` (1-based, default 1) and `per_page` (default 25).
`per_page <= 0` means "no limit" — used by the frontend pagination bar's
"All" per-page option — and always reports back as a single page containing
every matching record.
"""
from sqlalchemy.orm import Query


def paginate(query: Query, page: int, per_page: int) -> tuple[list, dict]:
    page = max(1, page)
    total_records = query.count()

    if per_page is None or per_page <= 0:
        items = query.all()
        return items, {
            "page": 1,
            "per_page": total_records,
            "total_records": total_records,
            "total_pages": 1 if total_records else 0,
            "has_next": False,
            "has_previous": False,
        }

    total_pages = -(-total_records // per_page) if total_records else 0  # ceil division
    page = min(page, total_pages) if total_pages else 1
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return items, {
        "page": page,
        "per_page": per_page,
        "total_records": total_records,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_previous": page > 1,
    }
