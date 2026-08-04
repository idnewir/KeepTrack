# Keep Track

Keep Track is a self-hosted document management and financial analysis tool. It lets an organisation or individual upload PDF invoices, automatically extract and categorise the data using AI, track income against expenses on a live dashboard, manage contributions and reconciliations, and export professional PDF reports.

Keep Track was originally built for a charity site (KHOC) to replace a manual, spreadsheet-based bookkeeping process, but it is designed to be generic enough for any organisation — or an individual — that needs to track invoices, contributions, and a running balance over time.

## Quick Start

> Placeholder — full setup instructions will be added once the backend and frontend are functional.

```bash
# Clone the repository
git clone <repo-url>
cd "Keep Track"

# Copy the environment template and fill in your values
cp .env.example .env

# Start everything with Docker Compose
docker compose up --build
```

The frontend will be available at `http://localhost:3000` and the API at `http://localhost:8000` (ports configurable in `.env`).

## Tech Stack

| Layer          | Technology                                      |
|----------------|--------------------------------------------------|
| Frontend       | React (responsive, mobile-browser compatible)   |
| Backend        | Python FastAPI                                  |
| Database       | PostgreSQL                                      |
| AI             | Anthropic API (Claude) — extraction & reports   |
| PDF processing | PyMuPDF (fitz) — extraction & signing           |
| Auth           | JWT + TOTP MFA (pyotp)                          |
| Containers     | Docker + docker-compose, deployable to k3s      |
| Storage        | Local filesystem (original & signed PDFs)       |
| Folder watch   | inotify-based watcher for SMB/NFS shares        |

See [`docs/architecture.md`](docs/architecture.md) for full details.

## Documentation

Full project documentation lives in [`docs/`](docs/):

- [Project Overview](docs/project-overview.md)
- [Architecture](docs/architecture.md)
- [Branding](docs/branding.md)
- [Features](docs/features.md)
- [Database Schema](docs/database-schema.md)
- [User Roles](docs/user-roles.md)
- [Workflows](docs/workflows.md)
- [Decisions Log](docs/decisions-log.md)

Plain-English guides for end users live in [`user-guides/`](user-guides/).
