"""Planned project endpoints: log, edit, complete, and deactivate future planned spend."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.financial_year import FinancialYear
from models.planned_project import PlannedProject
from models.schemas import ProjectCreate, ProjectOut, ProjectUpdate
from models.user import User
from utils.deps import get_current_user, require_admin, require_standard

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return (
        db.query(PlannedProject)
        .filter(PlannedProject.active.is_(True))
        .order_by(PlannedProject.expected_month)
        .all()
    )


@router.get("/all", response_model=list[ProjectOut])
def list_all_projects(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return db.query(PlannedProject).order_by(PlannedProject.expected_month).all()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    if payload.financial_year_id is not None:
        fy = db.get(FinancialYear, payload.financial_year_id)
        if fy is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial year not found")

    project = PlannedProject(
        name=payload.name,
        description=payload.description,
        estimated_cost=payload.estimated_cost,
        expected_month=payload.expected_month.replace(day=1),
        financial_year_id=payload.financial_year_id,
        created_by=user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    if payload.financial_year_id is not None:
        fy = db.get(FinancialYear, payload.financial_year_id)
        if fy is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Financial year not found")
        project.financial_year_id = payload.financial_year_id

    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.estimated_cost is not None:
        project.estimated_cost = payload.estimated_cost
    if payload.expected_month is not None:
        project.expected_month = payload.expected_month.replace(day=1)

    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", response_model=ProjectOut)
def deactivate_project(
    project_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    project.active = False
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/complete", response_model=ProjectOut)
def complete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_standard),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    project.completed = True
    project.active = False
    db.commit()
    db.refresh(project)
    return project
