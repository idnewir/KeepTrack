"""Report endpoints: generate AI-summarised PDF reports, list, view, download, and soft-delete them.

Generating and downloading a report is open to every role, including Read
Only — docs/features.md#6/#7 are explicit that reports are read-only output
("any user role... can run and export a report") rather than a data-editing
action, so this is the one generation endpoint in the app that doesn't
require `require_standard`.
"""
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models.report import REPORT_TYPES, Report
from models.schemas import ReportGenerateRequest, ReportOut
from models.user import User
from services import report_service
from services.ai_service import generate_report_summary
from services.pdf_report_service import generate_report_pdf
from services.settings_service import get_site_name
from services.storage_service import save_report_pdf
from utils.deps import get_current_user, require_admin

router = APIRouter(prefix="/reports", tags=["reports"])


def _to_out(db: Session, report: Report) -> dict:
    author = db.get(User, report.generated_by)
    return {
        "id": report.id,
        "title": report.title,
        "generated_by": report.generated_by,
        "generated_by_username": author.username if author else None,
        "generated_at": report.generated_at,
        "date_from": report.date_from,
        "date_to": report.date_to,
        "categories_included": report.categories_included or [],
        "years_included": report.years_included,
        "report_type": report.report_type,
        "parameters": report.parameters or {},
    }


@router.get("", response_model=list[ReportOut])
def list_reports(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    reports = db.query(Report).filter(Report.deleted.is_(False)).order_by(Report.generated_at.desc()).all()
    return [_to_out(db, r) for r in reports]


@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    report = db.get(Report, report_id)
    if report is None or report.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return _to_out(db, report)


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    report = db.get(Report, report_id)
    if report is None or report.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    if not os.path.exists(report.file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report PDF is missing from storage")

    return FileResponse(
        report.file_path,
        media_type="application/pdf",
        filename=f"{report.title}.pdf",
    )


@router.delete("/{report_id}", response_model=ReportOut)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    report = db.get(Report, report_id)
    if report is None or report.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")

    report.deleted = True
    db.commit()
    db.refresh(report)
    return _to_out(db, report)


@router.post("/generate", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def generate_report(
    payload: ReportGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.date_from > payload.date_to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_from must not be after date_to")
    if payload.report_type not in REPORT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"report_type must be one of: {', '.join(REPORT_TYPES)}")

    data = report_service.build_report_data(
        db,
        date_from=payload.date_from,
        date_to=payload.date_to,
        category_ids=payload.category_ids,
        years_included=payload.years_included,
        report_type=payload.report_type,
    )

    site_name = get_site_name(db)

    if payload.title:
        title = payload.title
    else:
        type_label = {"historical": "Historical Report", "forecast": "Forecast Report", "combined": "Financial Report"}
        title = (
            f"{site_name} {type_label.get(payload.report_type, 'Report')} "
            f"({payload.date_from:%d %b %Y} - {payload.date_to:%d %b %Y})"
        )

    ai_summary = {"executive_summary": None, "key_insights": [], "trends_and_anomalies": None, "forward_looking_paragraph": None}
    if payload.include_ai_summary:
        ai_summary = generate_report_summary(data, site_name)

    generated_at = datetime.now(timezone.utc)
    pdf_bytes = generate_report_pdf(
        data=data,
        ai_summary=ai_summary,
        title=title,
        site_name=site_name,
        generated_by_username=user.username,
        generated_at=generated_at,
    )
    file_path = save_report_pdf(pdf_bytes, title, generated_at.date())

    report = Report(
        title=title,
        generated_by=user.id,
        generated_at=generated_at,
        date_from=payload.date_from,
        date_to=payload.date_to,
        categories_included=payload.category_ids,
        years_included=payload.years_included,
        report_type=payload.report_type,
        file_path=file_path,
        parameters={
            "title": payload.title,
            "date_from": payload.date_from.isoformat(),
            "date_to": payload.date_to.isoformat(),
            "category_ids": payload.category_ids,
            "years_included": payload.years_included,
            "report_type": payload.report_type,
            "include_ai_summary": payload.include_ai_summary,
        },
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _to_out(db, report)
