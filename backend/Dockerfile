FROM python:3.12-slim

WORKDIR /app

# postgresql-client-16 (matching the postgres:16-alpine server in
# docker-compose.yml) provides pg_dump/psql, used by services/backup_service.py
# for full-database backup and restore (Settings -> Storage & Backup). Pulled
# from the PGDG apt repo rather than Debian's own postgresql-client package,
# whose version can trail the server's — see docs/decisions-log.md.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y curl gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user — the image otherwise runs the app (and every
# dependency it loads) as root by default, which is more privilege than an
# API server needs and a needless amplifier for any future code-execution
# bug. /data is where storage_service/backup_service write invoice PDFs,
# reports, and backups (see docker-compose.yml's mounted volumes), so it
# needs to be owned by the same user the app runs as.
RUN groupadd --system keeptrack && useradd --system --gid keeptrack --home-dir /app keeptrack \
    && mkdir -p /data/invoices /data/watched /data/reports \
    && chown -R keeptrack:keeptrack /app /data
USER keeptrack

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
