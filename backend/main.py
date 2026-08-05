"""Keep Track backend entrypoint."""
import logging
import traceback

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import SessionLocal
from routers.ai_settings import router as ai_settings_router
from routers.auth import router as auth_router
from routers.categories import router as categories_router
from routers.contributions import router as contributions_router
from routers.dashboard import router as dashboard_router
from routers.financial_years import router as financial_years_router
from routers.invoices import router as invoices_router
from routers.logs import router as logs_router
from routers.projects import router as projects_router
from routers.reconciliation import router as reconciliation_router
from routers.reports import router as reports_router
from routers.settings import router as settings_router
from routers.storage import router as storage_router
from routers.system import router as system_router
from services import backup_service, error_service, maintenance_service, storage_service
from services.auth_service import ensure_superadmin
from version import APP_VERSION

logger = logging.getLogger("keep_track.main")

app = FastAPI(title="Keep Track API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_settings_router)
app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(contributions_router)
app.include_router(dashboard_router)
app.include_router(financial_years_router)
app.include_router(invoices_router)
app.include_router(logs_router)
app.include_router(projects_router)
app.include_router(reconciliation_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(storage_router)
app.include_router(system_router)


# POST /storage/restore sets backup_service.maintenance_mode_active() while a
# restore is in progress (replacing the database and files underneath every
# other request would otherwise be running against). /health and the restore
# endpoint itself stay reachable so the frontend can show a "restoring"
# state and poll for completion. See docs/decisions-log.md.
@app.middleware("http")
async def maintenance_mode_guard(request: Request, call_next):
    if backup_service.maintenance_mode_active() and request.url.path not in (
        "/health",
        "/storage/restore",
    ):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Keep Track is restoring from a backup. Please try again shortly."},
        )
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catches anything that escapes every router's own error handling and
    records it to error_log (source='unhandled') before returning a generic
    500 — so a bug that nobody explicitly logged still shows up in
    Settings → Logs rather than only in container stdout. See
    docs/decisions-log.md."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    db = SessionLocal()
    try:
        error_service.log_error(
            db, "critical", "unhandled", f"{type(exc).__name__}: {exc}",
            stack_trace=traceback.format_exc(),
            request_path=request.url.path,
        )
    except Exception:
        logger.exception("Failed to record unhandled exception to error_log")
    finally:
        db.close()

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred."},
    )


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        storage_service.ensure_storage_dirs(db)
        ensure_superadmin(db)
    finally:
        db.close()

    # Retention maintenance: runs once now, then a background thread fires
    # it again every 90 days. See services/maintenance_service.py.
    maintenance_service.run_maintenance_once()
    maintenance_service.start_scheduler()

    # Scheduled backups (daily/weekly/monthly, per the backup_schedule
    # setting): checked once a minute by a background thread so a due
    # backup runs within a minute of 2am rather than needing separate
    # infrastructure (cron, Celery beat). See services/maintenance_service.py.
    maintenance_service.start_backup_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}
