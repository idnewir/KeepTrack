# Decisions Log

A running record of significant design decisions, why they were made, and when. Newest first once the project is underway — initial decisions are listed together below as the project's starting baseline.

---

## Baseline decisions (project inception)

| Decision | Rationale |
|----------|-----------|
| **Financial year runs September to August** | Matches KHOC's (the first deployment's) financial year convention. Configurable per deployment, but this is the default. |
| **Target reserve uses a three-month rolling average** | Gives a simple, self-adjusting benchmark for a healthy balance without needing a manually maintained target figure. |
| **Signing workflow is toggleable** | Not every use case needs a signed audit trail (e.g. a personal budget tracker). Building it as an optional step keeps the app relevant to multiple use cases without forcing unnecessary steps on users who don't need it. |
| **MFA via authenticator app only — no email-based login** | Authenticator-app TOTP is more secure than email codes (no dependency on email account security or deliverability) and works offline. Keeps the auth surface simple. |
| **Responsive web app only — no native mobile app** | Avoids the cost and complexity of maintaining separate iOS/Android apps. A well-built responsive layout covers the mobile use case (checking the dashboard, uploading a photo of an invoice) without that overhead. |
| **Self-hosted on Proxmox/k3s, cloud-ready when needed** | Keeps hosting costs and data control in the user's hands initially, while the containerised architecture (Docker/docker-compose, k3s-deployable) means a move to a cloud Kubernetes service later is straightforward if needed. |
| **Logo: Option 2 — bar chart with green tick badge** | Chosen over alternative logo concepts as the clearest visual combination of "financial tracking" (bar chart) and "confirmed/accurate" (tick badge), reflecting the app's core value proposition. |
| **Colour scheme inspired by jw.org** | Chosen for its clean, calm, uncluttered aesthetic with generous whitespace — a good fit for a financial tool that should feel trustworthy and easy to read, not busy or overwhelming. |

---

*Future decisions should be appended below with a date, the decision, and the rationale, e.g.:*

```
## YYYY-MM-DD — Decision title
**Decision:** ...
**Rationale:** ...
```

---

## 2026-08-04 — Authentication system build

**Decision:** Pending registrations (`POST /auth/register`) get a placeholder role of `standard` at creation, with `approved=false`. The approving Admin confirms or changes the role via `POST /auth/approve-user/{id}`.
**Rationale:** `users.role` is `NOT NULL` in the schema, but a role isn't meaningfully chosen until approval. A placeholder avoids a schema change while keeping "assigns their role" as the Admin's real decision at approval time.

**Decision:** The Superadmin account, bootstrapped from `SUPERADMIN_USERNAME`/`_EMAIL`/`_PASSWORD` env vars at backend startup, is excluded from the "no users exist" check that gates the setup wizard.
**Rationale:** Without this, an env-configured Superadmin would make the users table permanently non-empty, so the first-run setup wizard (which is meant to create the first real Admin) could never run. The Superadmin is a recovery backdoor, not part of normal onboarding, so it's reasonable to treat it as invisible to "has anyone set this up yet."

**Decision:** Added `GET /auth/setup-status` (not in the original endpoint list), an unauthenticated endpoint returning `{ setup_required: bool }`.
**Rationale:** The frontend router needs to decide, before any login attempt, whether to land on SetupPage or LoginPage. There was no other way to answer that question.

**Decision:** `POST /auth/register` now also returns an MFA QR code / secret, shown once on RegisterPage right after submitting (before navigating to PendingApprovalPage).
**Rationale:** Login always requires a TOTP code. Without this, a self-registered user would have no way to ever configure an authenticator app, since only the setup wizard originally showed a QR code — they'd be permanently unable to complete MFA once approved.

**Decision:** `users.mfa_secret` is encrypted at rest (Fernet, key from `MFA_ENCRYPTION_KEY`) and the column was widened from the documented `VARCHAR(64)` to `VARCHAR(255)` (migration `0002`).
**Rationale:** database-schema.md annotates this column "encrypted at rest," but an authenticated ciphertext (nonce + tag + payload) for a TOTP secret doesn't fit in 64 characters. Confirmed with the project owner before deviating from the documented column size — the annotation's intent (real encryption) was judged to matter more than the literal width.

**Decision:** JWT access tokens are split into two scopes: a 5-minute `mfa`-scoped token returned by `/auth/login`, exchanged for an 8-hour `access`-scoped token by `/auth/verify-mfa`.
**Rationale:** Keeps a password-only login from ever being sufficient on its own — the short-lived intermediate token can only be used to complete MFA, nothing else.

**Decision:** Login runs the bcrypt password comparison even when the username doesn't exist (against a fixed dummy hash).
**Rationale:** Otherwise the "no such user" path returns measurably faster than a real password check, letting an attacker enumerate valid usernames by response time.

**Decision:** `.env.example` (root) was updated with the new env vars this feature needs (`SUPERADMIN_*`, `MFA_ENCRYPTION_KEY`, `TOTP_ISSUER`) and `JWT_EXPIRY_MINUTES` was corrected from 60 to 480.
**Rationale:** It's the project's single source of config truth, not documentation — and the security requirements explicitly call for an 8-hour JWT expiry and env-sourced Superadmin credentials.

**Not addressed in this pass:** `main.py`'s CORS middleware uses `allow_origins=["*"]` together with `allow_credentials=True`, a combination browsers reject and that's broader than a deployed instance needs. This predates the auth build; worth tightening to the actual frontend origin(s) when deployment URLs are known.
