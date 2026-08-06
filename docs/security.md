# Security

This document describes the security measures currently in place in Keep Track, following a full audit of `backend/` and `frontend/` (2026-08-06). For the reasoning behind individual decisions, see the corresponding entries in [decisions-log.md](decisions-log.md).

## Authentication & sessions

- **Passwords:** bcrypt via `passlib`, with the cost factor explicitly pinned to 12 rounds (`backend/utils/security.py`) rather than relying on the library's own default.
- **Login timing:** the bcrypt comparison always runs, even for a username that doesn't exist (against a fixed dummy hash), so the response time doesn't reveal which usernames are registered.
- **MFA:** mandatory TOTP (30-second step, ±1 step clock-drift tolerance) for every role except Superadmin. `pyotp`'s `verify()` compares codes in constant time internally. MFA secrets are Fernet-encrypted at rest (`users.mfa_secret`) and never returned by any API response after the one-time reveal at registration/setup.
- **JWTs:** HS256, signed with `JWT_SECRET`. Login is two steps — a 5-minute `mfa`-scoped token, exchanged for an 8-hour `access`-scoped token only after TOTP verification — so a password alone is never sufficient. Every protected endpoint validates the token's signature, expiry, and scope (`utils/deps.get_current_user`).
- **Startup secret validation:** the backend refuses to start if `JWT_SECRET` or `MFA_ENCRYPTION_KEY` are missing, too short, or match a known placeholder/leaked value (`main.py::_validate_security_config`). There is no working default for either — a misconfigured deployment fails loudly instead of silently running with a key an attacker (or anyone who's read this repository) could already know.
- **Session invalidation:**
  - Logout is an audit-log entry only — JWTs are stateless, so the frontend discarding its token is the actual logout.
  - A full-system restore stamps a global "invalidate every token issued before now" setting, forcing everyone to log in again.
  - A password change (self-service, forced, or an Admin's reset) stamps a **per-user** `token_invalid_before` timestamp, checked on every request — every session for that user issued before the change stops working immediately, not just at its original 8-hour expiry. The endpoint that makes the change returns a fresh token for the session that just proved it knows the new password, so that session isn't locked out by its own action.
  - A deactivated or unapproved user's token is rejected in real time (the account's current state is re-checked from the database on every request, not cached in the token).
- **Brute-force protection:** `POST /auth/login`, `POST /auth/verify-mfa`, and `POST /auth/register` are rate-limited per client IP (`services/rate_limit_service.py`), backed by the same durable `system_events` counter pattern already used for `POST /system/reset` and `POST /ai/test`.
- **Token storage:** the frontend stores its access token in `localStorage` (`hooks/AuthContext.jsx`). This is a known tradeoff, not an oversight — see "Accepted risks" below.
- **Inactivity session timeout:** the frontend (`hooks/useSessionTimeout.js`) logs a user out — clearing local tokens and redirecting to `/login` — after a configurable period (`session_timeout_minutes`, Admin-configurable, default 2 hours; "Never" disables it) of no mouse/keyboard/touch/scroll activity, with a warning modal shown 5 minutes beforehand that only its own "Stay logged in" button can dismiss. This is a client-side UX control, not a server-side session boundary — the JWT itself keeps its own independent 8-hour expiry regardless, so a stolen token isn't rendered safe by this feature alone.
- **MFA remember session:** `POST /auth/verify-mfa` can optionally issue a long-lived "remember this browser" token (`mfa_remember_hours`, Admin-configurable, default 12 hours), stored hashed (SHA-256) in `mfa_remember_tokens` and, raw, in the browser's `localStorage`. A subsequent `POST /auth/login` presenting a still-valid token (via the `X-MFA-Remember-Token` header) skips the TOTP step entirely — the password check still runs first and is never skipped. The token is revoked (single specific token) on logout, and can be bulk-revoked (every active token for that user, across every browser) from the Profile page's "Revoke" button. See the security-considerations note in the decisions-log entry for the accepted trade-off this makes: it weakens MFA's "something you have, refreshed every login" guarantee to "something you have, refreshed at most every `mfa_remember_hours`" for the specific browser a user opted to trust, in exchange for not re-prompting for a TOTP code every time a short session timeout logs them out.

## Authorisation

- Every endpoint requires authentication (`Depends(get_current_user)` or stricter) except the small, deliberately public set: first-run setup, login, MFA verification, self-registration, and the narrow-window setup-wizard steps (gated internally by "is this the one Admin the setup wizard just created, and does a second user not exist yet" — not by a route decorator, since no access token exists at that point in the flow).
- Role checks (`require_standard`, `require_admin`, `require_superadmin`) are enforced server-side on every state-changing endpoint; the frontend's own route guards mirror the same rules but are not the source of truth.
- The Superadmin's no-MFA login path is decided purely by the `role` column already loaded from the database for that request — nothing in the request body can reach or influence it.
- This app has no per-user data partitioning by design (it's a single-organisation instance — see [project-overview.md](project-overview.md)); "can a user see another user's invoice" doesn't apply the way it would in a multi-tenant app. Authorisation here is role-based (what actions a role may perform), not ownership-based, and was audited on that basis across every router.

## Input validation & injection

- **SQL injection:** not reachable anywhere — every database query in the codebase goes through SQLAlchemy's ORM/query builder with bound parameters; there is no raw SQL string formatting.
- **File uploads (invoices):** validated against the file's actual magic bytes (`%PDF-`), not the client-supplied `Content-Type` header or filename extension, and capped at 25 MB. Filenames are sanitised (control characters, including CR/LF, stripped) before storage.
- **Path traversal:** upload filenames are reduced to their basename plus a UUID prefix before being written to disk; backup restore validates every archive entry's resolved path stays inside the configured storage root before writing it (see decisions-log for the zip-slip fix this closed).
- **CSV export (formula injection):** any cell that could be interpreted as a spreadsheet formula (`=`, `@`, a leading tab/CR, or a `+`/`-` not immediately followed by a digit) is prefixed with a single quote before being written, per OWASP's CSV-injection guidance.
- **Generated PDFs (markup injection):** any user-controlled text placed inside a ReportLab `Paragraph` (supplier names, notes, category/project names, usernames, report titles, AI-written summaries) is XML-escaped first — `Paragraph` parses a small markup dialect that includes `<img>`, which can otherwise fetch an attacker-chosen URL when the PDF is rendered.
- **Request size:** a global request-body-size ceiling (10 MB; 50 MB for the invoice-upload and backup-restore routes) is enforced in middleware.
- **Field lengths:** every Pydantic request schema declares explicit `min_length`/`max_length` (or numeric range) constraints; FastAPI rejects anything outside them before a handler runs.

## Data security

- API keys (`settings.ai_api_key`) and MFA secrets (`users.mfa_secret`) are encrypted at rest with Fernet (`utils/crypto.py`), using a key sourced from `MFA_ENCRYPTION_KEY` — never stored or logged in plaintext.
- Passwords and MFA secrets are never included in any API response (`UserOut` and every other outward-facing schema simply don't carry those columns). The one intentional exception — an MFA secret/QR code shown once at registration/setup — is a documented, deliberate design decision (see decisions-log), not a leak.
- The audit log never records an actual password or API key — only booleans like `api_key_changed`/`api_key_was_set`, or a reason string like `invalid_credentials`. Verified by direct search across every logging call site.
- Error messages returned to clients never include a raw stack trace or internal file path — the global exception handler (`main.py`) logs the real exception to `error_log` server-side and returns a generic "An unexpected error occurred" to the caller.

## Infrastructure

- Both `backend/Dockerfile` and `frontend/Dockerfile` run their application process as a non-root user.
- `docker-compose.yml`'s Postgres port is published on `127.0.0.1` only, not every network interface — the backend reaches it over the internal Docker network.
- CORS (`CORSMiddleware`) is restricted to an explicit, configurable allow-list (`CORS_ORIGINS`) rather than a wildcard.
- Every API response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and a maximally restrictive `Content-Security-Policy: default-src 'none'` (this API never renders HTML itself, so there's no legitimate content that policy would break).

## API security

- Rate limiting covers every brute-force-prone or expensive endpoint: login, MFA verification, registration (new in this audit), plus the pre-existing limits on `POST /system/reset` and `POST /ai/test`.
- Request bodies are capped (see Input validation above).
- List endpoints reject an unreasonably large `per_page` (capped at 5000) rather than materialising an unbounded result set.
- FastAPI's routing only ever exposes the HTTP methods a router explicitly declares.

## Frontend

- No `dangerouslySetInnerHTML`, `eval`, or `new Function` anywhere in the codebase (confirmed by direct search) — React's default escaping is never bypassed.
- No external links exist in the app at all (confirmed by direct search for `target="_blank"`), so there's nothing to add `rel="noopener noreferrer"` to.
- `index.html` carries a strict Content-Security-Policy (`script-src 'self'`, no inline scripts — the one pre-existing inline theme-detection script was moved to `public/theme-init.js` specifically so this policy wouldn't need an `unsafe-inline` carve-out).

## Dependencies

`backend/requirements.txt`: `python-jose` 3.3.0 → 3.5.0, `python-multipart` 0.0.9 → 0.0.32, and `fastapi` 0.115.0 → 0.141.1 (pulling a patched `starlette` transitively) were all bumped and verified against the live dev stack. `ecdsa` (transitive, no fix available upstream) is left as-is — this app never performs an ECDSA operation.

`frontend/package.json`: `react-router-dom` and `vite`/`esbuild` both have known issues with fixes available only via a major-version bump; not applied in this pass (no browser-automation tooling available here to regression-test a router major-version bump across every route). See "Accepted risks" and the decisions log for the full reasoning.

## Accepted risks / not fixed in this pass

These were found and deliberately not changed, with the reasoning recorded here rather than silently left out of scope:

1. **JWT — and, as of the session-timeout/MFA-remember-session build, the raw MFA remember token — in `localStorage`.** Both are readable by any successful XSS. No XSS sink exists anywhere in this codebase today (checked directly), and the new strict CSP closes the most likely vector, but this mitigates the risk rather than removing the class of it. A leaked remember token specifically only lets an attacker skip the TOTP step — the password is still required, so this isn't equivalent to a full account takeover on its own, and the token is both time-boxed (`mfa_remember_hours`) and revocable (Profile page, or automatically on logout/inactivity-timeout). Moving to an httpOnly cookie would need CSRF protection, `SameSite` config, and every API call and the backend's own auth flow to change together — a genuine architecture change, not a line-level fix.
2. **`vite`/`esbuild` and `react-router-dom` frontend dependency CVEs.** Fixes require major-version bumps (`npm audit fix --force`); not applied without real browser regression testing available. Separately: this app's `docker-compose.yml` runs the Vite **dev server** as its actual frontend service, which was never designed to be internet-facing — a production deployment should build static assets and serve them from a real static file server instead, which removes this whole class of dev-server-specific CVE regardless of version.
3. **Weak `SUPERADMIN_PASSWORD`/`POSTGRES_PASSWORD` in this deployment's own `.env`.** Not rotated here — a credential change carries real lockout/downtime risk best left to whoever operates this instance.
4. **Non-root Docker images and an already-provisioned deployment.** An already-running deployment's named volumes were created under the old root-running containers and are still root-owned; switching to non-root needs a one-off ownership fix (`docker compose run --user root backend chown -R keeptrack:keeptrack /data`) on upgrade. Documented rather than silently assumed away.
5. **`GET /ai/models`'s live Ollama/Custom endpoint fetch** is SSRF-shaped (an Admin-supplied URL, not yet saved, is fetched server-side) — pre-existing and out of scope for this pass; already flagged in the original AI-provider build's own decisions-log entry as acceptable for a self-hosted, Admin-only feature but worth tightening if ever exposed more broadly.
