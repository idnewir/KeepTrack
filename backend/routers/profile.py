"""Profile picture and saved-signature endpoints: upload, remove, and serve.

See services/profile_service.py for the actual image validation/processing
and storage layout.
"""
import hashlib
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import GravatarFetchRequest, UserOut
from models.user import User
from services import audit_service, profile_service
from utils.deps import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])

# Generous but bounded — this is a synchronous call to an external host made
# from within a request handler, so it must not hang indefinitely.
GRAVATAR_TIMEOUT_SECONDS = 10.0
GRAVATAR_NOT_FOUND_MESSAGE = (
    "No Gravatar found for this email address. Visit gravatar.com to set one up."
)


def _gravatar_url_for(email: str) -> str:
    digest = hashlib.md5(email.strip().lower().encode("utf-8")).hexdigest()
    return f"https://www.gravatar.com/avatar/{digest}?s=256&d=404"


def _fetch_and_save_gravatar(db: Session, user: User, email: str, *, is_refresh: bool) -> User:
    try:
        response = httpx.get(
            _gravatar_url_for(email), timeout=GRAVATAR_TIMEOUT_SECONDS, follow_redirects=True
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Could not reach Gravatar. Please try again."
        ) from exc

    if response.status_code == 404:
        raise HTTPException(status.HTTP_404_NOT_FOUND, GRAVATAR_NOT_FOUND_MESSAGE)
    if response.status_code != 200:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Could not reach Gravatar. Please try again."
        )

    try:
        avatar_path = profile_service.save_avatar(user.id, response.content, force_format="PNG")
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    user.avatar_path = avatar_path
    user.avatar_source = "gravatar"
    # Mutually exclusive with an external avatar URL — see docs/decisions-log.md.
    user.avatar_url = None
    db.commit()
    db.refresh(user)

    verb = "refreshed" if is_refresh else "fetched"
    audit_service.log_action(
        db, "profile.gravatar_fetched", f"'{user.username}' {verb} their profile picture from Gravatar",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
    )
    return user


@router.post("/avatar", response_model=UserOut)
def upload_avatar(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content = file.file.read()
    try:
        avatar_path = profile_service.save_avatar(user.id, content)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    user.avatar_path = avatar_path
    # A fresh upload replaces whatever produced the previous file, Gravatar
    # included — it's no longer accurate to offer "Refresh from Gravatar".
    user.avatar_source = "upload"
    # Mutually exclusive with an external avatar URL — see docs/decisions-log.md.
    user.avatar_url = None
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.avatar_uploaded", f"'{user.username}' uploaded a new profile picture",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
    )
    return user


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.avatar_path:
        profile_service.remove_avatar(user.id)
        user.avatar_path = None
        user.avatar_source = None
        db.commit()
        db.refresh(user)
        audit_service.log_action(
            db, "user.avatar_removed", f"'{user.username}' removed their profile picture",
            user_id=user.id, affected_table="users", affected_record_id=user.id,
        )
    return user


@router.post("/avatar/gravatar", response_model=UserOut)
def fetch_gravatar_avatar(
    payload: GravatarFetchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Looks up `payload.email` on Gravatar and, if found, fetches, resizes,
    and saves it as this user's avatar — same storage location and 256x256
    processing as an uploaded picture. See docs/decisions-log.md for why
    this fetch happens server-side rather than the browser loading the
    Gravatar image directly."""
    return _fetch_and_save_gravatar(db, user, payload.email, is_refresh=False)


@router.post("/avatar/gravatar/refresh", response_model=UserOut)
def refresh_gravatar_avatar(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Same as fetch_gravatar_avatar above, but always uses the user's
    current account email rather than an email supplied in the request —
    for picking up a Gravatar picture change without retyping the email."""
    return _fetch_and_save_gravatar(db, user, user.email, is_refresh=True)


@router.get("/avatar/{user_id}")
def get_avatar(
    user_id: int,
    db: Session = Depends(get_db),
    _current: User = Depends(get_current_user),
):
    """Any logged-in user can fetch any other user's avatar — used for
    display in the header, the user list, audit logs, and so on, not just a
    user's own profile. Always returns *something* (the uploaded file, a
    redirect to the external URL, or a generated initials avatar) rather
    than 404ing, so callers never need a client-side fallback."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if target.avatar_url:
        return RedirectResponse(target.avatar_url)
    if target.avatar_path and os.path.exists(target.avatar_path):
        return FileResponse(target.avatar_path)

    png_bytes = profile_service.generate_initials_avatar(target.display_name or target.username)
    return Response(content=png_bytes, media_type="image/png")


@router.post("/signature", response_model=UserOut)
def upload_signature(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content = file.file.read()
    try:
        signature_path = profile_service.save_signature(user.id, content)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    user.signature_path = signature_path
    db.commit()
    db.refresh(user)

    audit_service.log_action(
        db, "user.signature_uploaded", f"'{user.username}' saved a signature for signing documents",
        user_id=user.id, affected_table="users", affected_record_id=user.id,
    )
    return user


@router.delete("/signature", response_model=UserOut)
def delete_signature(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.signature_path:
        profile_service.remove_signature(user.id)
        user.signature_path = None
        db.commit()
        db.refresh(user)
        audit_service.log_action(
            db, "user.signature_removed", f"'{user.username}' removed their saved signature",
            user_id=user.id, affected_table="users", affected_record_id=user.id,
        )
    return user


@router.get("/signature/{user_id}")
def get_signature(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Unlike avatars, a saved signature is sensitive — it can be used to
    automatically sign real documents on this user's behalf — so only the
    owner or an Admin/Superadmin can fetch one. See docs/decisions-log.md."""
    if current.id != user_id and current.role not in ("admin", "superadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to view this signature")

    target = db.get(User, user_id)
    if target is None or not target.signature_path or not os.path.exists(target.signature_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No saved signature")

    return FileResponse(target.signature_path)
