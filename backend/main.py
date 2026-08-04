"""Keep Track backend entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal
from routers.auth import router as auth_router
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


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        ensure_superadmin(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
