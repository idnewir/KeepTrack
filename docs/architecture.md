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
                  Anthropic API   Local filesystem   Watched folder
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

- **Provider:** Anthropic API, using the `claude-sonnet-4-6` model.
- **Uses:**
  1. **Invoice extraction** — reading an uploaded PDF and returning structured data (date, supplier, amount, suggested category, notes, duplicate likelihood).
  2. **Report generation** — given a date range, category filter, and the underlying financial data, producing a written summary (historical analysis or forecast) for inclusion in exported PDF reports.
- All AI calls are made server-side from the backend; the frontend never talks to the Anthropic API directly.

## PDF Processing

- **Library:** [PyMuPDF](https://pymupdf.readthedocs.io/) (`fitz`).
- **Uses:**
  - Rendering PDF pages as images for the review-card preview.
  - Extracting text content to feed to the AI extraction step.
  - Overlaying a signature image and date at a user-chosen position/size, producing a signed PDF saved alongside the original.

## Authentication & Security

- **Login:** username + password, plus mandatory TOTP-based MFA (compatible with Google Authenticator, Authy, and similar apps), implemented with `pyotp`.
- **Session:** JSON Web Tokens (JWT) issued on successful login, used to authorise subsequent API requests.
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
