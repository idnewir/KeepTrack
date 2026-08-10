# Deployment

How to deploy Keep Track to production — on Proxmox with Docker Compose, or on a k3s Kubernetes
cluster. If you're developing locally, use `docker-compose.yml` instead (`docker compose up`) —
this document is about `docker-compose.prod.yml` and `k8s/`, the production-hardened setup: a
compiled frontend served by Nginx, the backend served by Gunicorn, a bundled Traefik reverse proxy
in front of both, no source code bind-mounted into the containers, and automatic database
migrations on startup. See [decisions-log.md](decisions-log.md) for why each of those choices was
made.

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
   This includes Traefik as the reverse proxy — no separate install needed, it works out of the
   box on ports 80/443. The backend applies any pending database migrations itself on startup —
   there's no separate migration step for a fresh install.
4. Visit `http://your-server-ip` — the setup wizard appears (this is the first-run flow, not
   related to the Superadmin recovery account from step 2).
5. Create your admin account and configure Keep Track (categories, financial year, contribution
   groups, target reserve — see [features.md](features.md)).

For a real domain and HTTPS, see [Enabling HTTPS](#enabling-https) below — the stack works over
plain HTTP first so you can confirm everything's running before adding a certificate.

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

## Deploying on Proxmox LXC

### Overview

An LXC container is a good fit for Keep Track on Proxmox: it's lightweight, uses noticeably less
RAM than a full VM (no separate guest kernel to boot), and shares the host's kernel directly rather
than virtualizing hardware. For a single app like Keep Track, that overhead saving is real and the
isolation an LXC still provides is enough.

There are two ways to get there:

1. **Quick script (recommended)** — a community-maintained helper script provisions an
   unprivileged LXC with Docker and Docker Compose already installed and correctly configured, in
   a couple of minutes.
2. **Manual setup** — create the LXC yourself in the Proxmox web UI and install Docker by hand.
   Use this if you want full control over the container's configuration, or the helper script
   doesn't fit your environment.

Either way, you end up with a Docker-capable LXC and then follow the same
[Quick start](#quick-start-proxmox--docker) steps as any other Docker host. Note that this is
Docker **Engine** on Linux (what both approaches below install) — the bundled Traefik reverse
proxy has been verified to work correctly against it. That's distinct from Docker Desktop 29.x on
Mac, which has known networking issues with Traefik; see [decisions-log.md](decisions-log.md) if
you hit that on a Mac dev machine.

### Approach 1 — quick setup (Proxmox Helper Scripts)

1. Visit the [community-scripts Proxmox VE helper scripts site](https://community-scripts.github.io/ProxmoxVE)
   and search for the **Docker** LXC script.
2. Run the one-line installer it gives you in the Proxmox host shell. Follow the prompts (they let
   you choose privileged/unprivileged, resources, etc. — unprivileged is fine and is what Keep
   Track has been run under).
3. This creates an unprivileged LXC with Docker and the Docker Compose plugin pre-installed and
   correctly configured — nesting/keyctl and other LXC settings that Docker needs are already
   handled for you.
4. Once the LXC is up, SSH into it and follow the standard
   [Quick start](#quick-start-proxmox--docker) steps above (clone the repo, configure `.env`,
   `docker compose -f docker-compose.prod.yml up -d`).

### Approach 2 — manual LXC setup

1. **Create the container in the Proxmox web UI:**
   - Template: Ubuntu 22.04 or Debian 12.
   - Disk: 20GB minimum (more if you'll be storing a large volume of PDFs).
   - RAM: 2GB minimum, 4GB recommended for comfortable use.
   - CPU: 2 cores minimum.
   - Network: DHCP or a static IP, either is fine.
   - Under **Options → Features**, enable **Nesting** (Docker requires it) and **keyctl**
     (required for some Docker operations).
   - Leave **Unprivileged container** checked — more secure, and works fine with Docker once
     nesting/keyctl are enabled.

2. **Start the LXC, open a shell, and install Docker:**
   ```
   apt-get update && apt-get upgrade -y
   curl -fsSL https://get.docker.com | sh
   systemctl enable docker
   systemctl start docker
   ```

3. **Install the Docker Compose plugin:**
   ```
   apt-get install -y docker-compose-plugin
   ```

4. **Verify Docker is working:**
   ```
   docker run hello-world
   ```

5. **Deploy Keep Track:**
   ```
   apt-get install -y git
   git clone [your-git-repo-url] /opt/keeptrack
   cd /opt/keeptrack
   cp .env.example .env
   nano .env  # fill in required values
   bash scripts/generate-secrets.sh  # paste the output into .env
   docker compose -f docker-compose.prod.yml up -d
   ```

6. **Verify the deployment:**
   ```
   docker compose -f docker-compose.prod.yml ps
   ```
   All containers should show as healthy.

7. **Access Keep Track** at `http://[LXC-IP-ADDRESS]` — the setup wizard appears on first visit.

### Storage considerations for LXC

The `keeptrack_storage` Docker volume holds all PDFs, signatures, and reports, and by default lives
inside the LXC's own disk. For larger deployments, mount a Proxmox NFS share or an additional disk
into the LXC and point Keep Track's storage path at it (**Settings → Data → Storage & Backup**) —
for example, mount a NAS NFS share at `/mnt/nas` in the LXC, then set the storage path to
`/mnt/nas/keeptrack`.

### Network access

The LXC gets its own IP on your network — Keep Track is reachable at `http://[LXC-IP]` on port 80.
To reach it from outside your network, set up port forwarding on your router to the LXC's IP. For
SSL, point a domain at your public IP, enable that port forwarding, then follow
[Enabling HTTPS](#enabling-https) above.

### Keeping Keep Track updated in an LXC

Same as [Updating](#updating) above, run from inside the LXC:
```
cd /opt/keeptrack
git pull
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```
Migrations run automatically on startup.

### Proxmox backup

Use Proxmox's built-in CT backup (`vzdump`) to back up the entire LXC, including its Docker
volumes — schedule nightly backups under **Datacenter → Backup**. Use this alongside, not instead
of, Keep Track's own backup feature (**Settings → Data → Storage & Backup**) — the Proxmox backup
protects the whole container, while Keep Track's application-level backup can be scheduled
independently to a NAS; see [Backup and restore](#backup-and-restore) below.

### Troubleshooting LXC

- **Docker fails to start:** check that Nesting is enabled under the LXC's **Options → Features**.
- **Containers restart constantly:** usually insufficient RAM — increase to 4GB if needed.
- **Traefik can't reach the other containers:** verify the `keeptrack` Docker network exists:
  `docker network ls`.
- **View logs:** `docker compose -f docker-compose.prod.yml logs -f`.

## Reverse proxy (Traefik, included)

`docker-compose.prod.yml` includes Traefik as a bundled `traefik` service — Keep Track is fully
self-contained out of the box, with no external reverse proxy to install or configure. Traefik is
the only service in the stack that publishes ports (80/443 by default); `frontend` and `backend`
publish nothing and are reached only over the internal `keeptrack` Docker network. Traefik
auto-discovers the `frontend` container via Docker labels already present on that service in
`docker-compose.prod.yml` — see `config/traefik-labels.yml` for how the labels work.

Once real users load the app from a domain, update `CORS_ORIGINS` in `.env` (or
`k8s/configmap.yaml`) to that domain and restart the backend.

If you'd rather use a host-level Nginx or Cloudflare Tunnel instead of the bundled Traefik, see
`config/nginx-proxy.conf`'s header comment — this requires removing/disabling the `traefik`
service and publishing a port on `frontend` directly.

### Enabling HTTPS

Traefik ships SSL-ready but with HTTPS disabled by default, so a fresh install works immediately
without a domain or certificate. To enable HTTPS via Let's Encrypt:

1. Point your domain's DNS `A` record at this server.
2. Open `docker-compose.prod.yml` and set a real email address on the `acme.email` line under the
   `traefik` service's `command:` (used only for Let's Encrypt expiry notices).
3. Uncomment every line marked `# SSL via Let's Encrypt` under the `traefik` service's `command:`.
4. Uncomment every line marked `# SSL router` under the `frontend` service's `labels:`.
5. Restart the stack:
   ```
   docker compose -f docker-compose.prod.yml up -d
   ```
   Traefik requests a certificate automatically via the HTTP-01 challenge on first request and
   renews it before expiry, storing it in the `traefik_data` volume — no certbot, no manual
   renewal step. HTTP traffic on port 80 is redirected to HTTPS once this is enabled.

### Changing the default ports

If 80 and/or 443 are already in use on the host, set `KEEPTRACK_HTTP_PORT` and/or
`KEEPTRACK_HTTPS_PORT` in `.env` to free ports instead, then restart:
```
docker compose -f docker-compose.prod.yml up -d
```
For local testing on a machine where you don't want to touch `.env` at all (e.g. a Mac where 80
is often already taken), use the bundled override instead:
```
docker compose -f docker-compose.prod.yml -f docker-compose.prod-test.yml up -d
```
which remaps Traefik to `8080`/`8443` — visit `http://localhost:8080`.

### Accessing the Traefik dashboard

The dashboard is **disabled by default** (`--api.dashboard=false`, `--api.insecure=false`) —
running it exposes your routing configuration, and the insecure API is an unauthenticated control
surface, neither of which should be reachable on a production host. To enable it temporarily for
debugging:

1. In `docker-compose.prod.yml`, under the `traefik` service's `command:`, change
   `--api.insecure=false` to `--api.insecure=true` and `--api.dashboard=false` to
   `--api.dashboard=true`.
2. Add a port mapping for the dashboard (Traefik's internal API/dashboard listens on 8080):
   ```
   ports:
     - '127.0.0.1:8081:8080'
   ```
   Bind it to `127.0.0.1` only — use an SSH tunnel to reach it remotely rather than exposing it
   further.
3. `docker compose -f docker-compose.prod.yml up -d`, then visit `http://localhost:8081/dashboard/`.
4. **Revert both changes** once done debugging and restart again.

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
