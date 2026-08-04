"""Keep Track backend entrypoint."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import SessionLocal
from routers.auth import router as auth_router
from routers.categories import router as categories_router
from routers.contributions import router as contributions_router
from routers.dashboard import router as dashboard_router
from routers.financial_years import router as financial_years_router
from routers.invoices import router as invoices_router
from routers.projects import router as projects_router
from routers.reconciliation import router as reconciliation_router
from routers.settings import router as settings_router
from services.auth_service import ensure_superadmin

app = FastAPI(title="Keep Track API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(contributions_router)
app.include_router(dashboard_router)
app.include_router(financial_years_router)
app.include_router(invoices_router)
app.include_router(projects_router)
app.include_router(reconciliation_router)
app.include_router(settings_router)


@app.on_event("startup")
def on_startup():
    os.makedirs(os.path.join(settings.invoice_storage_path, "original"), exist_ok=True)
    os.makedirs(settings.signed_invoice_storage_path, exist_ok=True)

    db = SessionLocal()
    try:
        ensure_superadmin(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
