# Upgrade Notes

How to upgrade an existing Keep Track deployment to a newer version, plus version-specific steps
for a handful of past changes that need a one-off manual step on top of the general process. If
you're setting up Keep Track for the first time rather than upgrading an existing install, this
document isn't for you — there's nothing to migrate yet.

## 1. General upgrade process

1. **Pull the latest code.**
   ```
   git pull
   ```
2. **Rebuild the Docker images**, so any new/updated dependencies (Python packages, npm packages,
   base image versions) are picked up.
   ```
   docker compose build
   ```
3. **Restart the containers** with the newly built images.
   ```
   docker compose up -d
   ```
   As of the production packaging pass, the backend's startup event runs `alembic upgrade head`
   itself (guarded by a Postgres advisory lock so it's safe under gunicorn's multiple worker
   processes — see `backend/main.py::_run_migrations` and
   [decisions-log.md](decisions-log.md)) before it starts accepting requests, and exits rather than
   serving traffic if a migration fails — so this step now migrates the database automatically, no
   separate manual command needed. You can still run one by hand if you want to migrate ahead of a
   restart (see [Database migrations](#4-database-migrations) below), but it's no longer required.
5. **Verify the app is running correctly.**
   - `docker compose ps` — `postgres`, `backend`, and `frontend` should all show `Up` (the
     `watched-folder-watcher` container is expected to be restarting — see
     [Known issues and workarounds](#6-known-issues-and-workarounds)).
   - `docker compose logs backend --tail=50` — look for `Application startup complete` and no
     tracebacks.
   - Load the app in a browser and log in. Spot-check the page(s) most relevant to whatever
     changed in this release (check the commit messages / decisions-log.md entries for the
     version you're upgrading to).
   - `curl http://localhost:8000/health` (or your configured `BACKEND_PORT`) — should return `200`.

Read the [version-specific notes](#2-version-specific-notes) below *before* step 5 if you're
upgrading from an older version — some releases need an extra manual step the general process
above doesn't cover.

## 2. Version-specific notes

### Upgrading from before the security audit (pre commit `d65fc3c`)

Commit `d65fc3c` ("security: full security audit and fixes") changed both Docker images to run as
a non-root user instead of root:

- The **backend** image now runs as a dedicated `keeptrack` user.
- The **frontend** image now runs as `node` — the low-privilege user already built into the
  `node:20-alpine` base image, not a custom `keeptrack` account.

If you're upgrading from a version before this commit, the named Docker volumes the backend writes
to (`invoice_storage`, `report_storage`, `watched_folder`) were created while the container ran as
root, so the files inside them are still root-owned. Once the container switches to running as
`keeptrack`, it can no longer write to them, and you'll see `Permission denied` errors from PDF
signing, invoice upload, report generation, or backups.

Fix it with a one-off ownership change, run once after the upgrade:

```
docker compose exec --user root backend chown -R keeptrack:keeptrack /data
```

(If the `backend` container isn't running at that point — e.g. it failed to start because of this
exact problem — use `docker compose run --rm --user root backend chown -R keeptrack:keeptrack /data`
instead, then start it normally with `docker compose up -d backend`.)

You do not need to repeat this on every future upgrade — it's a one-off fix for volumes that
predate this change. A fresh install's volumes are already owned correctly and never need it.

This same commit also changed `TOTP_ISSUER` handling and Postgres's port binding — see
[docs/security.md](security.md) and the `d65fc3c` entry in [decisions-log.md](decisions-log.md)
for the full list of what changed.

### Postgres "permission denied" on the data directory

The official `postgres:16-alpine` image Keep Track uses has always run its own server process as a
non-root `postgres` user internally — this isn't a Keep Track-specific change, and there's no
"before/after" version boundary for it in this project's history. It's included here because it's
a common, generic Docker/Postgres gotcha worth knowing about during any upgrade that touches the
`postgres` service: if the `postgres_data` volume was ever populated by a different Postgres major
version, copied in from another host, or had its files touched directly as root (e.g. manually
poking around inside the volume), the container can fail to start with ownership errors on
`/var/lib/postgresql/data`.

If that happens:

```
docker compose exec --user root postgres chown -R postgres:postgres /var/lib/postgresql/data
```

## 3. Back up before upgrading

Always take a manual backup before upgrading, so you have something to restore from if the
upgrade goes wrong:

**Settings → Storage & Backup → Create manual backup** (Admin only).

This downloads a zip containing a full database dump, every file under the configured storage
path, and a manifest. Store the download somewhere outside the Docker volumes — a backup that
lives on the same disk as the thing it's backing up doesn't protect you if that disk (or the
volume) is what goes wrong. See [storage-and-backup.md](storage-and-backup.md) for the full detail
on what's included and how to restore it (**Settings → Storage & Backup → Restore from backup**,
Superadmin only).

## 4. Database migrations

Keep Track uses [Alembic](https://alembic.sqlalchemy.org/) for schema migrations
(`backend/alembic/`). The backend's startup event runs `alembic upgrade head` itself before it
starts accepting requests (`backend/main.py::_run_migrations`), so a normal `docker compose up -d`
after pulling new code and rebuilding is enough — there's no separate manual migration step in
either the dev or production compose file. If a migration fails, the backend logs the error and
exits rather than serving traffic against a schema the code doesn't expect. See
[decisions-log.md](decisions-log.md) for why this changed from the previous manual-only process.

You can still run one by hand at any time (e.g. to migrate ahead of restarting, or to inspect what
would happen):

```
docker compose exec backend alembic upgrade head
```

If the `backend` container isn't currently running, use
`docker compose run --rm backend alembic upgrade head` instead — `run` starts a fresh one-off
container attached to the same volumes/network rather than requiring an already-running one.

Check what's currently applied at any time with:

```
docker compose exec backend alembic current
```

Never run new code against an un-migrated database, and never skip a migration by editing the
database by hand to match what a later migration would have produced — Alembic tracks the applied
revision chain in its own table (`alembic_version`), and skipping a step desyncs that from reality
in a way that breaks every future `alembic upgrade`.

## 5. Environment variables

After pulling new code, diff your `.env` against the repo's `.env.example` to check for anything
new:

```
diff .env .env.example
```

Two variables are validated at startup and will stop the backend from starting at all if they're
missing, too short, or match a known-insecure placeholder (`backend/main.py::_validate_security_config`):

- **`JWT_SECRET`** — must be at least 32 characters. Generate one with `openssl rand -hex 32`.
- **`MFA_ENCRYPTION_KEY`** — must be a valid Fernet key. Generate one with:
  ```
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```

If either is missing or insecure, the backend logs exactly what's wrong and refuses to serve
traffic, rather than silently running with a key an attacker (or anyone who's read this
repository's source) could already know.

Other variables worth knowing about, none of which block startup — every one has a working default
or is simply optional:

- **`CORS_ORIGINS`** — comma-separated list of origins the backend accepts requests from. Defaults
  to `http://localhost:3000`; a production deployment needs this set to wherever the frontend is
  actually served from, or the browser will block every API call.
- **`SUPERADMIN_USERNAME`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`** — optional. If all three are
  set, a recovery Superadmin account is bootstrapped on first startup; if any are left unset, that
  step is skipped entirely and no error is raised. Recommended for any real deployment, since it's
  the only account recovery path if every Admin gets locked out.
- **`AI_TEST_RATE_LIMIT`** — how many times per hour per user the "Test connection" button
  (Settings → AI & Extraction) can be used. Defaults to 60; only worth changing for a heavy
  configuration/testing session.

## 6. Known issues and workarounds

- **`watched-folder-watcher` container restart-loops.** This is expected, not a sign anything is
  broken. The service is a placeholder — it prints a message and exits immediately — so with
  `restart: unless-stopped` in `docker-compose.yml`, Docker keeps restarting it. It doesn't affect
  the rest of the app; watched-folder ingestion isn't implemented yet.
- **AI features doing nothing / invoice fields coming back empty.** If `.env`'s `ANTHROPIC_API_KEY`
  (or whichever provider is configured in Settings → AI & Extraction) is a placeholder or invalid,
  AI extraction and report summaries fail closed by design — invoices still upload and reports
  still generate, just without AI-filled fields or narrative text. Check
  `docker compose logs backend` or Settings → Logs → Errors for the underlying provider error, and
  update the key in Settings → AI & Extraction (or `.env`, then restart the backend).
- **Don't run this deployment's Vite dev server as a production frontend.** `docker-compose.yml`'s
  `frontend` service runs `npm run dev` — the Vite *development* server, not a production build.
  That's fine for local use, but a dev server was never designed to be internet-facing. For a real
  deployment, build static assets (`npm run build` inside `frontend/`) and serve them from a proper
  static file server instead — see the "Accepted risks" section of [security.md](security.md) for
  the full reasoning.
- **Rotate the default secrets in your own `.env` before going anywhere near production.**
  `JWT_SECRET`/`MFA_ENCRYPTION_KEY` are enforced at startup (see above), but `POSTGRES_PASSWORD`
  and `SUPERADMIN_PASSWORD` are not — the app will happily start with whatever weak or default
  value is sitting in `.env`. Nothing rotates these automatically; it's on whoever operates the
  deployment.
