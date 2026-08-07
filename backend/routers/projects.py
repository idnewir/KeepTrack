"""Planned project endpoints: log, edit, complete, and deactivate future planned spend."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models.financial_year import FinancialYear
from models.planned_project import PlannedProject
from models.schemas import FinancialYearOut, ProjectCreate, ProjectOut, ProjectUpdate
from models.user import User
from services import audit_service, financial_year_service as fy_service, project_service
from utils.deps import get_current_user, require_admin, require_module, require_standard

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(require_module("planned_projects"))])


def _project_to_out(db: Session, project: PlannedProject) -> dict:
    funding = project_service.funding_progress(db, project) or {}
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "estimated_cost": project.estimated_cost,
        "expected_month": project.expected_month,
        "financial_year_id": project.financial_year_id,
        "created_by": project.created_by,
        "created_at": project.created_at,
        "active": project.active,
        "completed": project.completed,
        "completed_at": project.completed_at,
        "edited_by": project.edited_by,
        "edited_at": project.edited_at,
        "edit_reason": project.edit_reason,
        "admin_edit_notes": project.admin_edit_notes,
        "is_funding_target": project.is_funding_target,
        "funding_target_amount": project.funding_target_amount,
        "funding_target_date": project.funding_target_date,
        "funding_notes": project.funding_notes,
        **funding,
        **project_service.project_financials(db, project),
    }


# Not in the original endpoint list — added so the planned-project form's
# financial year dropdown can always offer the current year plus the next
# two, even before anything else (dashboard, contributions, reconciliation)
# has ever referenced them. Auto-creates the next two years quietly (no
# audit log entry) the same way get_or_create_financial_year already does
# for the current year. See docs/decisions-log.md.
@router.get("/financial-years", response_model=list[FinancialYearOut])
def list_project_financial_years(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    current = fy_service.get_or_create_financial_year(db)
    next_start = date(current.start_date.year + 1, current.start_date.month, 1)
    year_after_start = date(current.start_date.year + 2, current.start_date.month, 1)
    next_fy = fy_service.get_or_create_financial_year(db, next_start)
    year_after_fy = fy_service.get_or_create_financial_year(db, year_after_start)
    return [current, next_fy, year_after_fy]


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    projects = (
        db.query(PlannedProject)
        .filter(PlannedProject.active.is_(True))
        .order_by(PlannedProject.expected_month)
        .all()
    )
    return [_project_to_out(db, p) for p in projects]


@router.get("/all", response_model=list[ProjectOut])
def list_all_projects(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    projects = db.query(PlannedProject).order_by(PlannedProject.expected_month).all()
    return [_project_to_out(db, p) for p in projects]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return _project_to_out(db, project)


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
        is_funding_target=payload.is_funding_target,
        funding_target_amount=payload.funding_target_amount if payload.is_funding_target else None,
        funding_target_date=payload.funding_target_date if payload.is_funding_target else None,
        funding_notes=payload.funding_notes if payload.is_funding_target else None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    audit_service.log_action(
        db, "project.created", f"Created planned project '{project.name}'",
        user_id=user.id, affected_table="planned_projects", affected_record_id=project.id,
    )
    return _project_to_out(db, project)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    if project.completed:
        is_admin = user.role in ("admin", "superadmin")
        if not (is_admin and payload.admin_override):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This project is complete and locked. An Admin can unlock it with admin_override.",
            )
        if not payload.edit_reason:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "A reason is required when editing a completed project",
            )

        # Only name, description, and estimated_cost are editable on a
        # completed project — status and completion cannot change here.
        if payload.estimated_cost is not None and payload.estimated_cost != project.estimated_cost:
            project.admin_edit_notes = f"Previous estimated cost: £{project.estimated_cost}"
            project.estimated_cost = payload.estimated_cost
        if payload.name is not None:
            project.name = payload.name
        if payload.description is not None:
            project.description = payload.description

        project.edited_by = user.id
        project.edited_at = datetime.now(timezone.utc)
        project.edit_reason = payload.edit_reason

        db.commit()
        db.refresh(project)

        audit_service.log_action(
            db, "project.edited", f"Edited completed project '{project.name}' (admin override): {payload.edit_reason}",
            user_id=user.id, affected_table="planned_projects", affected_record_id=project.id,
        )
        return _project_to_out(db, project)

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
    if payload.is_funding_target is not None:
        project.is_funding_target = payload.is_funding_target
        if not payload.is_funding_target:
            project.funding_target_amount = None
            project.funding_target_date = None
            project.funding_notes = None
    if project.is_funding_target:
        if payload.funding_target_amount is not None:
            project.funding_target_amount = payload.funding_target_amount
        if payload.funding_target_date is not None:
            project.funding_target_date = payload.funding_target_date
        if payload.funding_notes is not None:
            project.funding_notes = payload.funding_notes

    db.commit()
    db.refresh(project)

    audit_service.log_action(
        db, "project.edited", f"Edited planned project '{project.name}'",
        user_id=user.id, affected_table="planned_projects", affected_record_id=project.id,
    )
    return _project_to_out(db, project)


@router.delete("/{project_id}", response_model=ProjectOut)
def deactivate_project(
    project_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    project.active = False
    db.commit()
    db.refresh(project)

    audit_service.log_action(
        db, "project.deactivated", f"Deactivated planned project '{project.name}'",
        user_id=admin.id, affected_table="planned_projects", affected_record_id=project.id,
    )
    return _project_to_out(db, project)


@router.post("/{project_id}/complete", response_model=ProjectOut)
def complete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_standard),
):
    project = db.get(PlannedProject, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    project.completed = True
    project.completed_at = datetime.now(timezone.utc)
    project.active = False
    db.commit()
    db.refresh(project)

    audit_service.log_action(
        db, "project.completed", f"Marked planned project '{project.name}' as complete",
        user_id=user.id, affected_table="planned_projects", affected_record_id=project.id,
    )
    return _project_to_out(db, project)
