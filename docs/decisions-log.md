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

---

## 2026-08-04 — Superadmin has no MFA step

**Decision:** `POST /auth/login` skips the MFA step and returns a full access token directly when the authenticating user's stored role is `superadmin`. All other roles (Admin, Standard, Read only) are unaffected and continue through the existing password → `verify-mfa` flow. The response now carries an `mfa_required` flag so the frontend knows which path it's on; `LoginPage` routes straight to the Dashboard when it's `false` instead of to `/mfa`.
**Rationale:** Superadmin is a break-glass emergency recovery account (see [user-roles.md](user-roles.md)) — used when Admin accounts are locked out or forgotten. Requiring TOTP on the one account meant to recover from lockouts risks locking out the recovery path itself (e.g. a lost authenticator device with no other Admin left to help). The branch is decided purely by the `role` column on the row already loaded from the database during password verification — nothing in the request body can reach or influence it, so it cannot be triggered for any other account by client-side manipulation.

---

## 2026-08-04 — Category management build

**Decision:** The seven default categories are inserted with `op.bulk_insert` inside the Alembic migration (`0003_create_categories_table.py`) that creates the `categories` table, rather than at backend startup like the Superadmin bootstrap.
**Rationale:** Unlike the Superadmin account, the default category list is fixed and not env-driven — there's no configuration to read at runtime. Alembic is the single place where a fresh database's schema and its baseline data are established together, so seeding at migration time keeps "run the migrations" the one step needed to get a fully working install, with no separate seed script to remember.

**Decision:** `DELETE /categories/{id}` deactivates (`active = false`) rather than removing the row, and there is no hard-delete endpoint at all.
**Rationale:** `invoices.category_id` references `categories(id)`; deleting a category a historical invoice points to would either violate that foreign key or silently orphan financial history. Matches the schema doc's own annotation ("Deactivated, not deleted — preserves history") and the feature spec's explicit requirement.

**Decision:** `GET /categories` (active only) is available to any authenticated user, while `GET /categories/all`, create, update, deactivate, and restore are all Admin-only (`require_admin`).
**Rationale:** Every role needs the active category list to classify or filter invoices day-to-day (per [user-roles.md](user-roles.md), all roles can "browse all data"), but only Admin/Superadmin can "manage categories" per that same table — Standard and Read-only cannot add, edit, or deactivate them.

**Decision:** Category names are enforced unique at three layers: a `UNIQUE` DB constraint, an explicit pre-insert/pre-rename check in the router (returning a clear `400` message rather than a raw integrity-error 500), and client-side error display on the Categories page.
**Rationale:** Categories are used consistently for colour-coding across charts and badges — silently allowing duplicate names would make that classification ambiguous. A friendly `400` with a specific message is better than surfacing a database constraint violation to the user.

**Decision:** The Categories page lives at `/settings/categories`, reachable only via a Settings sub-item in the sidebar that's hidden for non-Admins, and the route itself is wrapped in a new `RequireAdmin` guard (`frontend/src/components/RouteGuards.jsx`) — the first role-based (as opposed to purely authenticated) route guard in the app.
**Rationale:** No admin-only route existed yet to model this on; `RequireAdmin` follows the same shape as the existing `RequireAuth`/`RequireGuest` guards but additionally checks `user.role`, so a non-Admin who navigates to the URL directly is redirected to the Dashboard rather than seeing the page flash before data loads.

---

## 2026-08-04 — Invoice upload and AI extraction build

**Decision:** `invoices.financial_year_id` was created nullable, deviating from database-schema.md's documented `NOT NULL`. A `financial_years` table was added (matching the doc's own schema for that table) purely so the FK target exists, but nothing populates it yet.
**Rationale:** The task brief explicitly asked for `financial_year_id` as "FK, nullable for now" — financial year assignment (opening balance, September–August rollover) isn't built yet, and forcing every invoice to a real financial year row before that exists would mean either a fake placeholder row or blocking the whole invoices feature on unrelated work. Nullable now, tightened to `NOT NULL` once financial year assignment ships.

**Decision:** An `invoices.deleted` boolean (default `false`) was added, even though it isn't in database-schema.md's documented column list.
**Rationale:** The task requires `DELETE /invoices/{id}` to soft-delete, and soft delete needs somewhere to record "deleted" that isn't already spoken for — unlike `categories.active` (which means "still offered for new use," not "deleted"), invoices have no existing flag that fits. Matches the categories precedent of preserving history rather than hard-deleting financial records.

**Decision:** Original PDFs are stored under `{INVOICE_STORAGE_PATH}/original/{year}/{month}/{uuid}_{filename}`, using the already-provisioned `invoice_storage` Docker volume (mounted at `/data/invoices` per `docker-compose.yml` and `.env.example`), rather than the `/app/storage/invoices/original/` path named in the original task brief.
**Rationale:** `docker-compose.yml` already mounts a persistent `invoice_storage` volume at `/data/invoices` — it was provisioned for exactly this purpose ahead of this build. Introducing a second, unmounted `/app/storage` path would either silently not persist across container restarts (defeating the point of a Docker volume) or require a second volume doing the same job as the first. Building on the existing mount keeps one clearly-documented storage location and still satisfies the brief's `{year}/{month}/` + UUID-prefix requirement.

**Decision:** Added `require_standard` to `utils/deps.py` — any authenticated, approved user except Read Only.
**Rationale:** `require_admin` (admin/superadmin only) and `get_current_user` (any authenticated user) didn't cover the "Standard user and Admin only" access level the task specifies for upload, update, and confirm. This is the first "not Read Only" gate in the app; matches the shape of the existing dependencies.

**Decision:** `DELETE /invoices/{id}` allows Standard and Admin to soft-delete an invoice that hasn't been reviewed yet (i.e. discarding a bad upload, as used by the ReviewCard's Discard button), but requires Admin once `reviewed` is `true`.
**Rationale:** The task brief states the endpoint is "Admin only," but the same brief also requires a Discard button on the review card, usable during the review step that Standard users perform themselves per `docs/user-roles.md` ("Standard user: Upload, review, approve, sign, and export invoices"). Read literally, Standard users could review invoices but never discard a bad one without an Admin's help — a Standard-only site would then be unable to use its own required Discard button. Splitting on `reviewed` keeps deleting a *committed, confirmed* financial record as an Admin-only, full-data-control action (matching `docs/user-roles.md`'s "Admin: full access... add/edit/delete data"), while treating discarding a not-yet-reviewed upload as part of the review workflow itself, open to whoever is allowed to review.

**Decision:** AI extraction (`backend/services/ai_service.py`) does not use the Anthropic API's structured-outputs feature (`output_config.format`); instead the prompt asks for a raw JSON object and the response is parsed defensively (strip code fences, `json.loads`, per-field type/range checks), with any failure — API error, unparsable JSON, wrong types — silently degrading to `null`/empty fields rather than raising.
**Rationale:** The configured model (`claude-sonnet-4-6`, per `docs/architecture.md` and `.env.example`'s `ANTHROPIC_MODEL`) isn't on Anthropic's list of models supporting `output_config.format`. Parsing defensively rather than trusting a schema also directly implements the feature spec's own requirement: "If extraction fails or is uncertain, return the fields as empty so the user can fill manually."

**Decision:** `backend/requirements.txt`'s pinned `anthropic==0.34.2` was relaxed to `anthropic>=0.40.0` (resolved to 0.120.2 at build time), breaking from the project's usual exact-pin convention for this one dependency.
**Rationale:** 0.34.2 predates GA support for PDF `document` content blocks (it required an early beta header) and for the JSON/structured-output helpers this feature's extraction prompting relies on. An exact pin would have meant guessing a specific working version number rather than letting pip resolve a current one; the deviation is scoped to this single line, not a project-wide convention change.

**Decision:** Duplicate detection (`check_duplicate` in `ai_service.py`) runs as an ordinary DB query alongside AI extraction, not as a second AI call — same supplier (case-insensitive exact match), invoice date within 7 days, and amount within 2% (or £1, whichever is larger) of an existing non-deleted invoice.
**Rationale:** The feature spec's duplicate criteria ("same supplier, amount, and a close date") are cleanly expressible as a database filter, which is exact, fast, and free — no reason to spend a model call on it or risk the AI inventing a supplier-name match that isn't really the same string.

**Decision:** The frontend adds a plain XHR-based `requestForm` helper in `utils/api.js` alongside the existing `fetch`-based `request`, used only by `invoicesApi.upload`.
**Rationale:** `request()` unconditionally sets `Content-Type: application/json` and `JSON.stringify`s the body, which breaks multipart file uploads; `fetch` also has no upload-progress event, which the task's "upload progress per file" requirement needs. `XMLHttpRequest.upload.onprogress` is the only way to get that in a browser without adding an HTTP client dependency.

**Decision:** PDF preview in the review card is rendered client-side (`pdfjs-dist`, added as the project's first PDF-in-browser dependency) directly from the `File` object still held in memory from the upload `<input>` — not fetched back from the server.
**Rationale:** The backend already has the bytes it needs (PyMuPDF, for text extraction) and doesn't need a "fetch the original PDF" endpoint just to satisfy the review card's preview, since the browser already has the exact same bytes the user just selected. Avoids adding a new authenticated file-serving endpoint for a preview that's only needed in the few seconds between upload and confirm.

**Decision:** No drag-and-drop library was added — `UploadPage.jsx` implements the dropzone with native HTML5 `onDragOver`/`onDrop` events.
**Rationale:** Consistent with the project's minimal-dependency pattern so far (plain `fetch`/`XMLHttpRequest` instead of axios, plain CSS instead of a component library) — native drag-and-drop events are sufficient for a single drop target and don't warrant a dependency.

**Decision:** "AI couldn't determine this field" is inferred on the frontend from sentinel empty values (`supplier === ''`, `amount <= 0`, `category_id === null`) rather than the backend returning an explicit per-field confidence flag.
**Rationale:** `invoices.supplier`, `.amount`, and `.invoice_date` are `NOT NULL` per the documented schema, so the upload endpoint must substitute something when the AI returns nothing — and in real invoice data a supplier can't legitimately be blank or an amount legitimately be zero, so these are safe, unambiguous "needs attention" signals without adding new columns or response fields just to carry a confidence marker.

---

## 2026-08-04 — PDF signing workflow build

**Decision:** `settings.updated_by` was created nullable, even though the task brief just listed it as "FK users" with no explicit nullability.
**Rationale:** The seeded `signing_enabled=true` default row (migration `0007`) is created by the migration itself, not by any user — a `NOT NULL` FK would have no valid value to put there. Matches the precedent set for `invoices.financial_year_id` (see the invoice upload build above): nullable where a real actor genuinely doesn't exist yet, tightened only if a future requirement needs it.

**Decision:** Signed PDFs are written under `settings.signed_invoice_storage_path` (`/data/invoices/signed/{year}/{month}/{uuid}_{filename}`, on the same `invoice_storage` Docker volume as originals) rather than the `/app/storage/invoices/signed/` path named in the task brief. The `{year}/{month}` used is the **signing date**, not the invoice date.
**Rationale:** `SIGNED_INVOICE_STORAGE_PATH` was already provisioned in `.env.example`, `config.py`, and `main.py`'s startup directory creation ahead of this build, mounted on the same persistent volume as original uploads — an unmounted `/app/storage` path would not survive a container restart. Same reasoning as the original-PDF storage location decision above. Dating the folder by signing date (rather than the invoice's own date, which could be months in the past) keeps the layout meaning "when did this signing event happen," consistent with how `original/{year}/{month}/` is dated by upload time rather than invoice date.

**Decision:** `POST /invoices/{id}/sign` re-checks the `signing_enabled` setting server-side and returns `400` if it's off, rather than trusting the frontend to only call it when enabled.
**Rationale:** The frontend hides the signing panel when the setting is off, but a stale tab or a direct API call could still hit the endpoint after an Admin turns signing off. The backend is the actual source of truth for whether this workflow is currently sanctioned for the organisation.

**Decision:** `sign_invoice_pdf` (`backend/services/signing_service.py`) always opens the *original* PDF and writes a brand-new file under the signed storage path — it never edits the original in place, and the invoice's original `invoice_files.original_path` is left untouched.
**Rationale:** Directly implements the feature spec's "original PDF is always kept — never overwritten" requirement, and matches PyMuPDF's own recommendation not to save a `fitz.Document` back over the file it was opened from.

**Decision:** The signing step is a second, full-width "stage" inside `ReviewCard` (`fields` → `signing`), not a panel shown alongside the editable fields. Clicking through from the fields stage (button reads "Continue to sign" when signing is enabled, or "Confirm" when it's off) saves the edited fields first, then swaps the whole card body for `SigningPanel`. Placing the signature there triggers sign → download → confirm automatically, with no separate manual "Confirm" click in the signing path.
**Rationale:** `docs/features.md` describes the signing step as "Left side: full PDF preview (all pages, scrollable) / Right side: signing controls" — a full layout in its own right, not a sidebar addition to the field-editing view. The task brief's EXPORT section is explicit that download and confirmation happen automatically once signing completes ("Automatically trigger a download... Then proceed to confirm"), so `SigningPanel`'s "Place signature" button is the one action that finishes the whole review.

**Decision:** The draggable/resizable signature box uses a single coordinate model — its position is always stored as `{page, xPct, yPct, wPct, hPct}` (percentages of that page's own width/height) — computed from pointer-drag deltas in absolute pixel space, re-deriving which page the box's centre currently falls into on every move. No drag-and-drop library was added.
**Rationale:** This is what makes cross-page dragging work inside one continuously-scrollable multi-page preview (as opposed to a page-by-page selector), while keeping the `x`/`y`/`width`/`height` values sent to `POST /invoices/{id}/sign` already in the resolution-independent percentage form the endpoint expects. Matches the project's established minimal-dependency convention (plain `fetch`/XHR, no component libraries) — Pointer Events (`onPointerDown`/`onPointerMove`/`onPointerUp`) are sufficient and additionally unify mouse and touch input for both the drag/resize handles and the signature pad itself, satisfying the "must work on both mouse and touch" requirement without separate code paths.

**Decision:** `/settings` and its sidebar entry are gated behind `RequireAdmin` in full (not just the signing toggle control within the page).
**Rationale:** `docs/features.md` describes Settings as "Accessible to Admins (and Superadmin); most settings are Admin-only" — treating the whole page as Admin-only mirrors how `/settings/categories` is already gated, rather than building a partially-visible page for roles that can't act on anything in it.

---

## 2026-08-04 — Main dashboard build

**Decision:** A `contributions` table was created now (migration `0008`), matching database-schema.md's already-documented shape exactly, even though the task brief's DATABASE section only asked for `planned_projects`. No CRUD endpoints were added for it.
**Rationale:** `/dashboard/summary` is explicitly required to report "total contributions received this financial year (from contributions table — nullable, 0 if none yet)" — that table has to exist for the endpoint to run at all. Building the Contributions feature itself (the `/contributions` page is still a placeholder) is out of scope for this task, so the table exists purely as a read target; it will simply stay empty, and the summary correctly reports £0, until that feature is built.

**Decision:** `planned_projects.expected_month` was built as a `DATE` (first of the month) rather than the `SMALLINT` (1-12, CHECK constrained) documented in database-schema.md, and the table also carries an `active BOOLEAN` column not in that doc.
**Rationale:** Both were explicit, literal requirements of this task's brief ("expected_month (date)", "active (boolean)"), which takes precedence over the older schema doc per the deviation pattern already established in this log (e.g. `invoices.financial_year_id` nullable, `invoices.deleted`). A `DATE` is also strictly more useful here: it disambiguates which calendar year a project's month falls in without leaning on `financial_year_id` (which is nullable), so a project can be forecast into the right month even before it's assigned to a financial year.

**Decision:** The dashboard aggregates invoices and contributions by comparing `invoice_date` (or `contributions.financial_year_id`) against the current financial year's `start_date`/`end_date` range, rather than filtering on `invoices.financial_year_id`.
**Rationale:** `invoices.financial_year_id` is nullable and nothing in the upload/confirm flow has ever populated it (see the 2026-08-04 invoice upload build entry above) — filtering on it would silently show zero invoices for every financial year. Date-range filtering works with the data that actually exists today; `financial_year_id` can be wired up wherever invoice creation is revisited next.

**Decision:** `financial_years` rows are created lazily — `financial_year_service.get_or_create_financial_year()` inserts the row for the current FY (by date-derived label) the first time anything asks for it, rather than requiring a separate financial-year-rollover step to have run first.
**Rationale:** No Settings screen or rollover job creates these rows yet (per `docs/features.md`#8, "Financial year configuration" isn't built). Since the dashboard, and now `planned_projects`/`contributions`, all need a real `financial_years.id` to reference, computing it from `today()` and creating it on first use is what lets the dashboard work from a fresh install with zero manual setup.

**Decision:** `GET /dashboard/notifications` computes its notifications live on every request (balance vs. target, stale unreviewed invoices, unsigned confirmed invoices) rather than reading/writing the `notifications` table documented in database-schema.md. "Dismiss" is frontend-only session state (a dismissed banner reappears on next login if the underlying condition is still true).
**Rationale:** Every notification type in this task's brief is a derived fact about current data ("balance below target," "invoice unreviewed > N days"), not a discrete event a table row would represent well — computing them fresh avoids the row ever going stale or duplicating. The `notifications` table stays available for a future notification type that genuinely is event-shaped (e.g. "duplicate flagged on invoice #123"), which live computation can't express.

**Decision:** The reconciliation-overdue notification is a code comment (in `routers/dashboard.py`), not a notification the endpoint ever emits.
**Rationale:** The task brief itself calls it a "placeholder for reconciliation overdue (reconciliation not built yet)" — the `monthly_reconciliations` table and feature don't exist yet, so there is no data "overdue" could be computed from. Emitting a fake or always-false notification would be worse than leaving a marked TODO for whoever builds reconciliation next.

**Decision:** The "invoices unreviewed for more than N days" notification threshold reuses the existing `UNCONFIRMED_INVOICE_ALERT_DAYS` config value (default 5) instead of a hardcoded 3 days.
**Rationale:** `docs/features.md`#8 already documents this exact threshold as configurable ("Notification thresholds — e.g. how many days an invoice can sit unconfirmed... before it triggers a login notification"), and `config.py` already exposes it. The task brief's "3 days" reads as an illustrative example of that same configurable threshold, not a new, second, hardcoded number — introducing one would leave two competing definitions of the same rule.

**Decision:** `routers/invoices.py`'s private `_signing_enabled()` helper was extracted to `services/settings_service.py` as `is_signing_enabled()`, and `invoices.py` was updated to import it.
**Rationale:** `/dashboard/notifications` needs the same "is signing currently on" check (for the unsigned-invoice notification) that `/invoices/{id}/sign` already had. Duplicating a private, underscore-prefixed helper into a second router would leave two copies of the same rule to keep in sync; moving it to `services/` (where `docs/architecture.md` says business logic belongs) fixes that for both call sites at once.

**Decision:** No charting library was added — the main financial-year chart (`frontend/src/components/FinancialChart.jsx`) is a hand-built inline SVG with a pointer-tracked crosshair/tooltip and legend-button click targets, rather than e.g. Recharts.
**Rationale:** Consistent with this project's established minimal-dependency pattern (plain `fetch`/XHR instead of axios, native drag events instead of a DnD library, Pointer Events for the signing canvas). A 12-point line/area chart is well within what plain SVG + React state can do cleanly, and it keeps the three click-through targets (income/spend/forecast) fully under the app's own control rather than fighting a library's event model.

**Decision:** Series colours are blue `#2D6B9F` (income), green `#1D9E75` (actual spend), amber `#C97A0C` (forecast), purple `#7C5CBF` (planned-project markers) — the first two are the existing brand primary/accent; amber and purple are new. All four were run through a categorical-palette colourblind/contrast validator before use.
**Rationale:** The task brief specified blue/green/amber/distinct-colour by role; amber `#C97A0C` and purple `#7C5CBF` were chosen to pass CVD-safe separation (protan/tritan ΔE ≥ 8, normal-vision floor ≥ 15) against the other three and against the app's off-white surface, rather than picking visually-plausible hex values by eye.

**Decision:** A new `/forecast` route (`ForecastBreakdownPage.jsx`) was added, reachable only by clicking the forecast series on the dashboard chart — it is not in the sidebar.
**Rationale:** `docs/features.md` requires "Click the forecast line to see a breakdown by category," and no such view existed. Not adding it to the sidebar matches how `InvoiceDetailPage` (reached only via the Invoices table) already works — a drill-down view, not a top-level destination.

**Decision:** `InvoicesPage.jsx` now reads its initial `categoryId`/`dateFrom`/`dateTo`/`reviewed` filter state from the URL's query string (`useSearchParams`, read once on mount) instead of always starting blank.
**Rationale:** The dashboard's "click actual spend → Invoices filtered to this financial year" and the unreviewed-invoices notification link both need to land on Invoices pre-filtered. Without this, every drill-down link into Invoices would silently drop its filter the moment the page loaded.

---

## 2026-08-04 — Contributions recording and monthly reconciliation build

**Decision:** `contributions.deleted` (boolean, default `false`) was added via migration `0010`, even though it isn't in database-schema.md's documented column list.
**Rationale:** The task requires `DELETE /contributions/{id}` to soft-delete, and — exactly as with `invoices.deleted` — there was no existing column that meant "deleted" rather than something else. Matches the precedent set for invoices: preserve financial history rather than hard-delete it.

**Decision:** `financial_years.opening_balance` (`NUMERIC(12,2)`, nullable) was added via migration `0011`, not documented in database-schema.md.
**Rationale:** The task's OPENING BALANCE section requires `PUT /financial-years/{id}/opening-balance`, but the existing `financial_years` table (built for the dashboard) had nowhere to store it. Nullable because a financial year starts with no opening balance set — the dashboard and Contributions page prompt for it until an Admin sets one.

**Decision:** `monthly_reconciliations.month` is stored as a `DATE` (first of the month), and `notes` is split into two columns, `discrepancy_notes` (user-entered) and `suggested_reason` (system-generated) — both deviating from database-schema.md's `month SMALLINT` and single `notes TEXT`.
**Rationale:** These were explicit, literal requirements of this task's brief, which takes precedence per the deviation pattern already established in this log (e.g. `planned_projects.expected_month`). Storing the two reasons separately also lets the suggested reason stay intact and re-derivable even after a user edits their own notes.

**Decision:** `calculated_balance` for a given month is computed live (not read from a stored running total) as `opening_balance + contributions recorded in months up to and including this one − confirmed invoices dated on or before the end of this month`, all scoped to one financial year. The same function (`services/reconciliation_service.calculated_balance_for_month`) backs both the Reconciliation page's per-month figure and the Contributions page's "running balance" column.
**Rationale:** Directly implements docs/features.md#4's formula ("money on hand = opening balance + contributions to date − invoices to date"), evaluated as of a specific past month rather than always "today" — a reconciliation for October needs October's balance, not the current one. Sharing one function between both pages means they can never silently disagree with each other about what "balance so far" means.

**Decision:** `POST /reconciliation` rejects a second submission for a month that's already been reconciled (`400`), rather than overwriting it. `PUT /reconciliation/{id}` only ever updates `discrepancy_notes` — the actual balance, calculated balance, and discrepancy are fixed at submission time.
**Rationale:** The task brief lists PUT's scope as "update discrepancy notes" only, with no endpoint for correcting a submitted actual balance. Treating a reconciled month as locked (bar its notes) keeps the reconciliation history an honest audit trail of what was actually checked against the bank each month, rather than a value that can quietly drift after the fact. A wrong entry needs an Admin to intervene directly rather than being silently overwritten via the API.

**Decision:** The "small vs. large" discrepancy threshold (`SMALL_DISCREPANCY_THRESHOLD` in `services/reconciliation_service.py`) is a fixed `£20`, not user-configurable.
**Rationale:** The task brief specifies the suggested-reason categories ("small positive," "large," etc.) without giving a threshold figure. £20 is a reasonable, round default for the scale of a small charity's bank interest/charges; making it a Setting is future work once the terminology/settings system referenced in the task brief exists.

**Decision:** `Contribution.recorded_by` and `MonthlyReconciliation.reconciled_by` are always set from the authenticated user (`Depends(require_standard)`), never from the request body, even though the task brief lists `recorded_by` among `POST /contributions`'s payload fields.
**Rationale:** Matches the existing `invoices.created_by` precedent — trusting a client-supplied "who did this" field would let one user record a contribution or reconciliation under another user's name. The brief's field list reads as documenting the column being populated, not as a literal request-body requirement.

**Decision:** Added `GET /financial-years/current` (not in the original endpoint list), any authenticated user, returning the current financial year including its opening balance (creating the row lazily if needed, same as the dashboard's existing behaviour).
**Rationale:** The Contributions and Reconciliation pages both need to know the current financial year's id and opening-balance status without pulling in the whole `/dashboard/summary` payload. Mirrors the precedent set by `/auth/setup-status` — a small lookup endpoint added because the frontend had no other way to answer a question it needed answered before rendering.

**Decision:** `DashboardFinancialYear` (and `/dashboard/summary`'s response) now also carries `opening_balance`, and the Dashboard shows its own "no opening balance set" amber prompt banner.
**Rationale:** The task brief explicitly asks for the prompt to appear "on the dashboard and contributions page." Reusing the field already being returned for the financial year avoids a second round-trip from the Dashboard just to check one value.

**Decision:** `ReconciliationPage.jsx` loads all 12 months of the financial year up front via 12 parallel calls to `GET /reconciliation/{year}/{month}`, rather than adding a bulk "all months" endpoint.
**Rationale:** No bulk endpoint was in the task's endpoint list, and each month's tile (reconciled/overdue/discrepancy colour) needs the same per-month shape `GET /reconciliation/{year}/{month}` already returns — including a live `calculated_balance` for months that haven't been reconciled yet, which the "list reconciliations" endpoint alone can't provide since it only has rows for months already reconciled.

---

## 2026-08-04 — Planned projects build

**Decision:** `planned_projects.completed` (boolean, default `false`) was added via migration `0013`, even though this task's DATABASE section listed only `id, name, description, estimated_cost, expected_month, financial_year_id, created_by, created_at, active` as the columns to verify/add.
**Rationale:** The task's FRONTEND section requires a "Mark as complete" action distinct from the Admin-only "Deactivate" action, a completed section separate from a simple deactivated one, and a per-project "Status (active/complete)" label. With only `active`, a completed project and an abandoned/deactivated one would be stored identically (`active = false`) and be indistinguishable in the UI. `completed` is the minimal addition that lets `POST /projects/{id}/complete` (which per the brief marks a project "complete and inactive") and `DELETE /projects/{id}` (deactivate) both set `active = false` while staying tellable apart — same precedent as `invoices.deleted` and `contributions.deleted` being added when a soft-delete flag was needed but not yet documented.

**Decision:** `GET /projects` (active only, any authenticated user) and `GET /projects/all` (all rows, Admin only) were built exactly as scoped in the task brief, and the frontend's "Completed projects" collapsed section on `ProjectsPage` is only fetched and rendered for Admins — Standard and Read Only users see the active list only.
**Rationale:** A completed project is `active = false`, so listing it at all requires `GET /projects/all`, which the brief explicitly restricts to Admin. Rather than adding a new non-Admin-safe endpoint (e.g. "active or completed") that the brief didn't ask for, the completed section simply follows the access rule already given — a Standard user can still mark a project complete (`POST /projects/{id}/complete` is "Standard and Admin"), they just won't see the resulting completed-projects list themselves.

**Decision:** The "Financial year" dropdown on `ProjectsPage`'s add/edit form offers only "Unassigned" and the current financial year (via the existing `GET /financial-years/current`), not a general list of financial years.
**Rationale:** No endpoint lists multiple financial years — financial year rollover isn't built yet (see the main dashboard build entry above), so `GET /financial-years/current` is the only financial year that can exist in practice. Matches the same constraint already accepted on the Contributions and Reconciliation pages.

**Decision:** A single shared helper, `projectUrgency()` (`frontend/src/utils/format.js`), decides amber/red styling for both `ProjectsPage` and the dashboard's planned-projects panel. "Overdue" (red) requires the *entire* expected month to have elapsed, not just its first day; "soon" (amber) covers the current month plus anything starting within the next 60 days.
**Rationale:** Directly implements docs/features.md's own wording — "amber if within 60 days, red if overdue" and "Overdue projects (expected month has passed...)". A project due later in the current month isn't overdue yet by that wording, so the overdue check is against month-end, not month-start. Sharing one function between the two pages means they can't silently disagree on which colour a given project gets, the same reasoning already used for `calculated_balance_for_month` in the contributions/reconciliation build.

**Decision:** `PUT /projects/{id}` and `POST /projects` normalise `expected_month` to the 1st of the submitted month server-side (`payload.expected_month.replace(day=1)`), and the frontend always submits `YYYY-MM-01` from an `<input type="month">` picker.
**Rationale:** `planned_project.py`'s own model comment documents `expected_month` as "a DATE (first of the month)" — normalising server-side keeps that invariant true regardless of what a future API caller sends, rather than trusting every caller to zero the day themselves.
