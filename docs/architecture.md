# Architecture

## Overview

Keep Track is a containerised web application with a React single-page frontend, a Python FastAPI backend, a PostgreSQL database, and a background folder-watcher process. All components run as Docker containers, orchestrated with docker-compose for development and deployable to a k3s cluster for production.

```
┌────────────┐      HTTPS      ┌────────────┐        SQL        ┌────────────┐
│  Frontend   │  ───────────▶  │   Backend   │  ───────────────▶ │ PostgreSQL │
│  (React)    │  ◀───────────  │  (FastAPI)  │  ◀─────────────── │            │
└────────────┘      JSON       └─────┬──────┘                    └────────────┘
                                       │
                         ┌─────────────┼─────────────┐
                         ▼             ▼             ▼
                  AI provider     Local filesystem   Watched folder
                  (extraction &   (PDF storage:      watcher (inotify,
                   report text)    original+signed)   SMB/NFS share)
```

## Frontend

- **Framework:** React, built as a responsive single-page app.
- **Compatibility:** Works in mobile browsers as well as desktop — there is no native mobile app. Users simply point a browser at the server URL.
- **Structure:** `src/components/` (reusable UI pieces), `src/pages/` (route-level views), `src/hooks/` (shared logic), `src/utils/` (helpers, API client).
- **Styling:** Keep Track branding (see [branding.md](branding.md)) applied via a shared theme/CSS layer, not hardcoded per-component.

## Backend

- **Framework:** Python, [FastAPI](https://fastapi.tiangolo.com/).
- **Structure:** `routers/` (API endpoints grouped by resource), `models/` (ORM/data models and Pydantic schemas), `services/` (business logic — extraction, reconciliation, forecasting, reporting), `utils/` (shared helpers).
- **API style:** JSON REST API consumed by the React frontend.

## Database

- **Engine:** PostgreSQL.
- **Access:** via an ORM (SQLAlchemy) from the FastAPI backend.
- **Schema:** see [database-schema.md](database-schema.md) for the full table design.

## AI Layer

- **Provider:** configurable at runtime from Settings → AI & Extraction (`backend/services/ai_provider_service.py`), not hardcoded. Supported providers: **Anthropic** (default, `claude-sonnet-4-6`), **OpenAI**, **Google Gemini**, **xAI Grok**, **Mistral**, **Cohere**, **Ollama** (self-hosted, OpenAI-compatible), and **Custom** (any other OpenAI-compatible endpoint). Configuration — provider, model, endpoint URL (for Ollama/Custom), and an on/off switch — lives in the `settings` table; the API key is stored there too, Fernet-encrypted at rest, with a fallback to a per-provider environment variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) when no key is configured in the database.
- **Uses:**
  1. **Invoice extraction** — reading an uploaded PDF and returning structured data (date, supplier, amount, suggested category, notes, duplicate likelihood). Anthropic reads the PDF natively (as a document content block); every other provider receives PyMuPDF-extracted text instead, since a single OpenAI-compatible chat-completion call is the one input shape all seven provider SDKs share.
  2. **Report generation** — given a date range, category filter, and the underlying financial data, producing a written summary (historical analysis or forecast) for inclusion in exported PDF reports.
- Both AI features degrade gracefully — a missing/invalid key, an unreachable endpoint, or AI being turned off entirely all fall back to empty/placeholder output (and are logged to `error_log`) rather than blocking the invoice upload or report generation flow; users can always fill fields in manually.
- All AI calls are made server-side from the backend; the frontend never talks to a provider's API directly. `POST /ai/test` lets an Admin verify the current configuration reaches the provider without running a real extraction/report.

## PDF Processing

- **Library:** [PyMuPDF](https://pymupdf.readthedocs.io/) (`fitz`).
- **Uses:**
  - Rendering PDF pages as images for the review-card preview.
  - Extracting text content to feed to the AI extraction step.
  - Overlaying a signature image and date at a user-chosen position/size, producing a signed PDF saved alongside the original.

## Feature Modules

- **Storage:** a `feature_modules` table (`backend/models/feature_module.py`) — `module_key`, `enabled`, `label`, `description`, `default_enabled`, `requires_setup` — seeded by migration `0038` with the modules listed in [features.md](features.md#9-feature-modules).
- **Backend enforcement:** `utils/deps.py`'s `require_module(module_key)` is a dependency factory, applied at router level (`dependencies=[Depends(require_module(...))]`) to every router that belongs entirely to one module (`routers/reconciliation.py`, `routers/projects.py`, `routers/ai_settings.py`, `routers/imports.py`, `routers/search.py`) and at endpoint level for the one exception that shares a router with ungated endpoints (`POST /invoices/{id}/sign`, gated on `signing_export`). A disabled module's endpoints return `403` with the message `"This feature is not enabled. Enable it in Settings → General"`. `services/modules_service.py` is the single place enabled state is read, written, and audit-logged (`get_all_modules`, `get_module`, `is_enabled`, `enable_module`, `disable_module`).
- **Background logic keeps running regardless of module state** — forecasting, reconciliation staleness checks, notification generation, and the folder watcher are never gated. Only UI visibility and API access change. See [decisions-log.md](decisions-log.md) for why.
- **Frontend state:** `frontend/src/context/ModulesContext.jsx` fetches `GET /modules` once on load and re-syncs from the `modules` object embedded in `GET /notifications/count` (the header notification bell's own 30-second poll) — no dedicated polling endpoint of its own. Exposes a `useModules()` hook returning `{ modules, isEnabled(moduleKey), isLoading, refresh }`. Sidebar links, the header search bar, dashboard panels, and the invoice review card all read `isEnabled()` to decide what to render; `Settings → General`'s Feature Modules list (`components/settings/FeatureModulesSettings.jsx`) is the only place that also fetches the full module records (label, description, `requires_setup`) directly via `GET /modules`, since toggling needs more than a boolean.
- **Endpoints:** `GET /modules` (any logged-in user), `PUT /modules/{module_key}` (Admin only, toggles `enabled`), `PUT /modules/{module_key}/label` (Admin only, renames a module — used by the Debt Tracking/Budget Planning setup prompts).

## Authentication & Security

- **First run:** a setup wizard (`POST /auth/setup`) creates the first Admin account and is only reachable while no non-Superadmin user exists yet.
- **Login:** username + password, plus mandatory TOTP-based MFA (compatible with Google Authenticator, Authy, and similar apps), implemented with `pyotp` (30-second step, ±1 step tolerance for clock drift), for every role except Superadmin. Login is two steps: `POST /auth/login` (password) returns a short-lived (5 minute) token scoped to MFA only, then `POST /auth/verify-mfa` (TOTP code) returns the full access token. For Superadmin, `POST /auth/login` returns the full access token directly, based solely on the role stored on that account — see [decisions-log.md](decisions-log.md).
- **Self-registration:** `POST /auth/register` creates a user in a pending state; an Admin approves and assigns their role via `POST /auth/approve-user/{id}`. Registrants are shown their MFA QR code once, immediately after registering, since it's the only point in that flow where they see it.
- **Session:** JSON Web Tokens (JWT), HS256, expiring after 8 hours, issued once MFA is verified.
- **Password storage:** bcrypt via `passlib`.
- **MFA secret storage:** `users.mfa_secret` is encrypted at rest (Fernet) using a key from `MFA_ENCRYPTION_KEY`, not stored as plaintext.
- **Superadmin:** bootstrapped from `SUPERADMIN_USERNAME` / `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` env vars on backend startup, independent of the setup wizard — a recovery account, not part of normal onboarding (see [user-roles.md](user-roles.md)).
- **Authorisation:** role-based access control enforced in the backend (see [user-roles.md](user-roles.md)).

## Containerisation & Deployment

- **Local/dev:** Docker + docker-compose (`docker-compose.yml` at the project root) — spins up `frontend`, `backend`, `postgres`, and `watched-folder-watcher` services.
- **Production:** deployable to a k3s cluster (e.g. self-hosted on Proxmox), using the same container images with Kubernetes manifests layered on top of the compose definitions.

## Storage

- **PDFs:** stored on the local filesystem of the backend host/container, in a mounted volume — original uploads and signed exports kept separately.
- **Database:** structured data (users, invoices metadata, categories, contributions, reconciliations, projects, notifications) lives in PostgreSQL; the PDF files themselves are referenced by path, not stored as blobs in the database.

## Watched Folder

- A separate lightweight service (`watched-folder-watcher`) uses inotify (Linux) to monitor a configured SMB/NFS-mounted folder for new PDF files.
- When a new file appears, the watcher notifies the backend (via an internal API call or shared queue), which runs the same extraction/review pipeline as a manual upload.
- The watched folder path is configurable from Settings (see [features.md](features.md#8-settings)).
