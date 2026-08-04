"""Application configuration, loaded from environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://keep_track:change-me@localhost:5432/keep_track"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 480  # 8 hours, per security requirements
    jwt_mfa_expiry_minutes: int = 5  # short-lived pre-MFA token

    totp_issuer: str = "Keep Track"
    # Fernet key encrypting mfa_secret at rest — generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    mfa_encryption_key: str = "Y--gwZnpacveIT8vPJl1yoqdRCJj3G7apSRtMJw0nIo="

    superadmin_username: str | None = None
    superadmin_email: str | None = None
    superadmin_password: str | None = None


settings = Settings()
