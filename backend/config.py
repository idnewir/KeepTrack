"""Application configuration, loaded from environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://keep_track:change-me@localhost:5432/keep_track"

    # These two have no functional default on purpose — an earlier version
    # of this file shipped a hardcoded placeholder secret and an actual
    # working Fernet key here, which meant any deployment that forgot to
    # override them via .env was silently signing JWTs with (and encrypting
    # MFA secrets under) a key visible to anyone who has read this source
    # file. main.py's startup check now refuses to serve traffic until both
    # are set to something real, rather than degrading silently. See
    # docs/decisions-log.md and docs/security.md.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 480  # 8 hours, per security requirements
    jwt_mfa_expiry_minutes: int = 5  # short-lived pre-MFA token

    totp_issuer: str = "Keep Track"
    # Fernet key encrypting mfa_secret at rest — generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    mfa_encryption_key: str = ""

    superadmin_username: str | None = None
    superadmin_email: str | None = None
    superadmin_password: str | None = None

    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-6"

    # Max POST /ai/test calls per user per hour (services/ai_provider_service.py
    # .recent_test_count). Deployment-level, not an Admin-editable Setting, so
    # it can be raised for a busy build/test session without a code change.
    ai_test_rate_limit: int = 60

    # Comma-separated list of origins the frontend is served from (e.g.
    # "https://track.example.org,https://track-staging.example.org").
    # CORSMiddleware is configured with exactly this list — never a wildcard
    # alongside allow_credentials=True, which is both broader than any real
    # deployment needs and a combination browsers themselves reject. See
    # docs/decisions-log.md and docs/security.md.
    cors_origins: str = "http://localhost:3000"

    # Hard ceiling on any request body (bytes) — a coarse defence against a
    # client sending an enormous payload before any endpoint-specific
    # validation gets a chance to run. Invoice/backup uploads get their own,
    # larger limit below.
    max_request_body_bytes: int = 10 * 1024 * 1024  # 10 MB
    max_upload_body_bytes: int = 50 * 1024 * 1024  # 50 MB — invoice PDF / backup zip uploads

    # Original/signed invoice PDFs and generated reports all live under a
    # single configurable root, the DB-backed storage_path setting (see
    # services/storage_service.py) — not env vars, so an Admin can change it
    # at runtime via PUT /storage/path. watched_folder_path stays an env var:
    # it's an *input* the folder-watcher scans, not app-managed storage.
    watched_folder_path: str = "/data/watched"

    # Fallback used only if the financial_year_start_month settings row is
    # somehow missing/unset — see services/settings_service.py. The FY end
    # month is always derived as the month before this one, so there's no
    # separate end-month setting.
    default_financial_year_start_month: int = 9
    unconfirmed_invoice_alert_days: int = 5


settings = Settings()
