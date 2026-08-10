# Rebuild regularly to pick up base image security patches
# docker compose build --no-cache && docker compose up -d

# --- Stage 1: dependencies --------------------------------------------------
FROM python:3.12-slim AS deps

WORKDIR /app

# build-essential covers any pinned package in requirements.txt that doesn't
# ship a prebuilt wheel for the host architecture; discarded entirely along
# with this whole stage once pip install finishes.
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Stage 2: production ----------------------------------------------------
FROM python:3.12-slim AS production

WORKDIR /app

# postgresql-client-16 (matching the postgres:16-alpine server in
# docker-compose.prod.yml) provides pg_dump/psql, used by
# services/backup_service.py for full-database backup and restore
# (Settings -> Storage & Backup). Pulled from the PGDG apt repo rather than
# Debian's own postgresql-client package, whose version can trail the
# server's — see docs/decisions-log.md. curl is also kept (not purged) since
# the container's own HEALTHCHECK/docker-compose healthcheck shells out to it.
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# No build tools (gcc etc.) in this stage — only the packages already
# compiled/installed in the deps stage are copied across.
COPY --from=deps /usr/local /usr/local

COPY . .

# Run as a non-root user — the image otherwise runs the app (and every
# dependency it loads) as root by default, which is more privilege than an
# API server needs and a needless amplifier for any future code-execution
# bug. /data is where storage_service/backup_service write invoice PDFs,
# reports, and backups (see docker-compose.prod.yml's mounted volume), so it
# needs to be owned by the same user the app runs as.
RUN groupadd --system --gid 1000 keeptrack \
    && useradd --system --uid 1000 --gid keeptrack --home-dir /app keeptrack \
    && mkdir -p /data \
    && chown -R keeptrack:keeptrack /app /data
USER keeptrack

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["gunicorn", "main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
