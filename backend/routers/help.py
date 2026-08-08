"""In-app help guide endpoints. Guides are markdown files that live in
user-guides/ at the repo root — mounted read-only into the backend container
at /app/user-guides — so the guides have a single source of truth instead of
being duplicated into the frontend build. See docs/decisions-log.md.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse

from models.schemas import HelpGuideOut
from models.user import User
from utils.deps import get_current_user

router = APIRouter(prefix="/help", tags=["help"])

GUIDES_DIR = Path("/app/user-guides")

# Order and titles shown in the Help page's left-hand nav.
GUIDES = [
    {"key": "getting-started", "title": "Getting Started", "filename": "getting-started.md"},
    {"key": "uploading-invoices", "title": "Uploading Invoices", "filename": "uploading-invoices.md"},
    {"key": "reviewing-and-signing", "title": "Reviewing & Signing", "filename": "reviewing-and-signing.md"},
    {"key": "dashboard-guide", "title": "Dashboard Guide", "filename": "dashboard-guide.md"},
    {"key": "managing-contributions", "title": "Managing Income", "filename": "managing-contributions.md"},
    {"key": "reconciliation-guide", "title": "Reconciliation", "filename": "reconciliation-guide.md"},
    {"key": "reports-guide", "title": "Reports", "filename": "reports-guide.md"},
    {"key": "settings-guide", "title": "Settings Guide", "filename": "settings-guide.md"},
    {"key": "transaction-rules", "title": "Transaction Rules", "filename": "transaction-rules.md"},
    {"key": "feature-modules", "title": "Feature Modules", "filename": "feature-modules.md"},
    {"key": "folder-integration", "title": "Folder Integration", "filename": "folder-integration.md"},
    {"key": "debt-tracking", "title": "Debt Tracking", "filename": "debt-tracking.md"},
    {"key": "budget-planning", "title": "Budget Planning", "filename": "budget-planning.md"},
]
GUIDES_BY_KEY = {g["key"]: g for g in GUIDES}


@router.get("", response_model=list[HelpGuideOut])
def list_guides(_user: User = Depends(get_current_user)):
    return GUIDES


@router.get("/{guide_key}", response_class=PlainTextResponse)
def get_guide(guide_key: str, _user: User = Depends(get_current_user)):
    guide = GUIDES_BY_KEY.get(guide_key)
    if guide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Guide not found")

    file_path = GUIDES_DIR / guide["filename"]
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Guide not found")

    content = file_path.read_text(encoding="utf-8")
    return PlainTextResponse(content, headers={"Cache-Control": "max-age=300"})
