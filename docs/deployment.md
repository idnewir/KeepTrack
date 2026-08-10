# Deployment

How to deploy Keep Track to production — on Proxmox with Docker Compose, or on a k3s Kubernetes
cluster. If you're developing locally, use `docker-compose.yml` instead (`docker compose up`) —
this document is about `docker-compose.prod.yml` and `k8s/`, the production-hardened setup: a
compiled frontend served by Nginx, the backend served by Gunicorn, no source code bind-mounted
into the containers, and automatic database migrations on startup. See
[decisions-log.md](decisions-log.md) for why each of those choices was made.

## Quick start (Proxmox / Docker)

1. Clone the repository onto the host (or VM/LXC) that will run Keep Track.
2. Copy `.env.example` to `.env` and fill in the required values:
   ```
   cp .env.example .env
   ./scripts/generate-secrets.sh
   ```
   Paste the generated `JWT_SECRET` and `MFA_ENCRYPTION_KEY` into `.env`, then also set
   `POSTGRES_PASSWORD` and (optional but recommended) `SUPERADMIN_USERNAME` /
   `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`. See `.env.example` itself for what every variable
   does.
3. Start the production stack:
   ```
   docker compose -f docker-compose.prod.yml up -d
   ```
   The backend applies any pending database migrations itself on startup — there's no separate
   migration step for a fresh install.
4. Visit `http://your-server-ip` — the setup wizard appears (this is the first-run flow, not
   related to the Superadmin recovery account from step 2).
5. Create your admin account and configure Keep Track (categories, financial year, contribution
   groups, target reserve — see [features.md](features.md)).

## Updating

1. Pull the latest code:
   ```
   git pull
   ```
2. Rebuild the images, so any new/updated dependencies (Python packages, npm packages, base image
   versions) are picked up:
   ```
   docker compose -f docker-compose.prod.yml build
   ```
3. Restart with the newly built images:
   ```
   docker compose -f docker-compose.prod.yml up -d
   ```
4. Migrations run automatically on startup — no manual `alembic upgrade head` step. See
   [upgrade-notes.md](upgrade-notes.md) for the full upgrade process, version-specific one-off
   steps, and how to back out if something's wrong.

Take a manual backup before updating (**Settings → Storage & Backup → Create manual backup**) —
see [upgrade-notes.md](upgrade-notes.md#3-back-up-before-upgrading).

## Proxmox specific

- **Recommended:** run Keep Track in an LXC container or a VM with Docker installed. An
  unprivileged LXC container works fine as long as nested containers/overlayfs are permitted (the
  default on recent Proxmox versions).
- **Minimum specs:** 2 CPU cores, 4GB RAM, 20GB storage. Add more storage headroom if you expect a
  large volume of invoices/reports, or a long backup retention window.
- **Storage volume for `/data`** (invoices, signed PDFs, reports, backups): for anything beyond
  a small/personal deployment, mount a separate disk or an NFS share at the Docker volume's
  location rather than relying on the VM/LXC's root disk — this keeps growth in invoice/report
  storage from ever competing with the OS disk, and makes it easy to move storage to different
  hardware later without touching the database. Point Docker's `keeptrack_storage` named volume
  (see `docker-compose.prod.yml`) at that mount, e.g. via a bind-mount volume definition instead of
  the default named volume.

## Reverse proxy (optional but recommended)

`docker-compose.prod.yml` publishes no ports by default — the frontend container is meant to sit
behind a reverse proxy, terminating TLS and giving Keep Track a real domain name. Three options,
covered in [config/](../config/):

- **Traefik** (recommended if you're already running containers elsewhere on the host, and the
  only option covered here for k3s): add the labels in `config/traefik-labels.yml` to the
  `frontend` service and run both compose files together. Automatic Let's Encrypt certificates via
  Traefik's own certificate resolver — no separate certbot setup.
- **Host-level Nginx:** use `config/nginx-proxy.conf` as a template. Requires uncommenting the
  loopback port mapping under `frontend` in `docker-compose.prod.yml` first (the template's
  comments explain why) since a proxy running outside Docker can't reach an unpublished container
  port.
- **Cloudflare:** works as a reverse proxy in front of either of the above (or directly in front of
  a published frontend port) — configure a Cloudflare Tunnel or origin rule pointing at the host,
  and set `CORS_ORIGINS` in `.env` to your Cloudflare-fronted domain.

Either way, once real users load the app from a domain, update `CORS_ORIGINS` in `.env` (or
`k8s/configmap.yaml`) to that domain and restart the backend.

## K3s deployment

The manifests in `k8s/` deploy the same images as the Compose setup, with a Traefik `Ingress`
(k3s's built-in default ingress controller — no separate install needed).

1. **Build and make the images available to your cluster.** For a single-node k3s host with no
   registry, build locally and import directly into containerd:
   ```
   docker compose -f docker-compose.prod.yml build
   docker save keeptrack-backend:latest | sudo k3s ctr images import -
   docker save keeptrack-frontend:latest | sudo k3s ctr images import -
   ```
   For a multi-node cluster, push to a registry instead and update the `image:` fields in
   `k8s/backend.yaml` / `k8s/frontend.yaml` accordingly.
2. **Create the namespace:**
   ```
   kubectl apply -f k8s/namespace.yaml
   ```
3. **Fill in and apply the Secret** (never commit real values into `k8s/secret.yaml` — see its own
   header comment for alternatives like `kubectl create secret generic` or a secrets-management
   tool):
   ```
   kubectl apply -f k8s/secret.yaml
   ```
4. **Create the user guides ConfigMap** (mirrors the Compose deployment's read-only bind mount of
   the repo's `user-guides/`):
   ```
   kubectl create configmap keeptrack-user-guides --from-file=user-guides/ -n keeptrack
   ```
5. **Apply everything else:**
   ```
   kubectl apply -f k8s/
   ```
6. **Check status:**
   ```
   kubectl get pods -n keeptrack
   kubectl get ingress -n keeptrack
   ```
7. Edit `k8s/ingress.yaml`'s `host` (and `k8s/configmap.yaml`'s `CORS_ORIGINS`) to your real
   domain, point DNS at your cluster's ingress IP, and re-apply.

See each manifest's own comments for specifics — resource requests/limits, health/readiness/startup
probes, and non-root security contexts are already configured on every workload.

## Backup and restore

Use the built-in backup feature: **Settings → Data → Storage & Backup**. A manual or scheduled
backup produces a zip containing a full database dump, every file under the configured storage
path, and a manifest — see [storage-and-backup.md](storage-and-backup.md) for the full detail and
the restore procedure (**Settings → Storage & Backup → Restore from backup**, Superadmin only).

- **Recommended:** a daily scheduled backup (Settings lets you configure the schedule) written to
  a NAS share or other storage outside the Docker/Kubernetes volumes — a backup that lives on the
  same disk as the thing it's backing up doesn't protect you if that disk is what fails.
- On k3s, back up the same way (the feature works identically); there's no separate
  Kubernetes-specific backup mechanism to configure.

## Maintenance

- **Monthly:** rebuild images to pick up OS security patches (both Dockerfiles run
  `apt-get upgrade -y` during the build, so a plain rebuild — not just a restart — is what actually
  picks up new patches):
  ```
  docker compose -f docker-compose.prod.yml build --no-cache
  docker compose -f docker-compose.prod.yml up -d
  ```
  On k3s, rebuild and re-import/push the images, then roll the deployments:
  ```
  kubectl rollout restart deployment/backend deployment/frontend -n keeptrack
  ```
- **Vulnerability scanning:** run `scripts/scan-images.sh` (requires [Trivy](https://aquasecurity.github.io/trivy/)) against the built images periodically, or wire it into CI.
- **Check error logs:** Settings → Notifications & Logs → Error Log.
- **Check audit log:** Settings → Notifications & Logs → Audit Log.
