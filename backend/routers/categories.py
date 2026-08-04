"""Category endpoints: view, add, edit, deactivate, and restore invoice categories."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.category import Category
from models.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from models.user import User
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_active_categories(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return db.query(Category).filter(Category.active.is_(True)).order_by(Category.name).all()


@router.get("/all", response_model=list[CategoryOut])
def list_all_categories(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return db.query(Category).order_by(Category.name).all()


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if db.query(Category).filter(Category.name == payload.name).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A category with that name already exists")

    category = Category(name=payload.name, colour=payload.colour)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    if payload.name is not None and payload.name != category.name:
        if db.query(Category).filter(Category.name == payload.name).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A category with that name already exists")
        category.name = payload.name

    if payload.colour is not None:
        category.colour = payload.colour

    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", response_model=CategoryOut)
def deactivate_category(
    category_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    category.active = False
    db.commit()
    db.refresh(category)
    return category


@router.post("/{category_id}/restore", response_model=CategoryOut)
def restore_category(
    category_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    category.active = True
    db.commit()
    db.refresh(category)
    return category
