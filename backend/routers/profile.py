"""Profile picture and saved-signature endpoints: upload, remove, and serve.

See services/profile_service.py for the actual image validation/processing
and storage layout.
"""
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy.orm import Session

from database import get_db
from models.schemas import UserOut
from models.user import User
from services import audit_service, profile_service
from utils.deps import get_current_user

router = APIRouter(prefix="/profile", tags=["profile"])


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
        db.commit()
        db.refresh(user)
        audit_service.log_action(
            db, "user.avatar_removed", f"'{user.username}' removed their profile picture",
            user_id=user.id, affected_table="users", affected_record_id=user.id,
        )
    return user


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
