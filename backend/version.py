"""Single source of the app version — read by main.py (FastAPI's `version=`)
and services/backup_service.py (embedded in every backup_manifest.json), so
the two can never drift apart."""
APP_VERSION = "0.1.0"
