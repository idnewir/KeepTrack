# Project Backlog

**Last updated:** 2026-08-08

This is the single source of truth for what needs to be done on Keep Track, from this point forward. It replaces ad hoc notes and scattered TODOs — when new work is identified, it should be added here rather than tracked elsewhere.

## How this document is structured

The backlog is split into four sections, ordered by how close each item is to production:

1. **V1 Bugs** — things that are broken or incomplete in already-built features. Must be fixed before production.
2. **V1 Features** — features designed and committed to for V1, but not yet built. Must be built before production.
3. **V1 Polish** — small improvements that make V1 feel complete, but don't block launch.
4. **V2 Wishlist** — longer-term ideas for future versions. Explicitly out of scope for V1.

Items move between sections as priorities shift and work progresses:

- A **V2 Wishlist** item can be pulled forward into **V1 Features** if it turns out to be needed for launch after all.
- A **V1 Polish** item can be promoted to **V1 Bugs** if what looked like a nice-to-have turns out to actually block a real workflow.
- Anything found broken while building a V1 Feature becomes a new **V1 Bug**, not a note buried in that feature's own section.
- Once an item is complete, remove it from its section rather than checking it off in place, so this document always reflects what's still outstanding, not a full history (see [decisions-log.md](decisions-log.md) for the historical record of what was built and why).

---

## Section 1 — V1 Bugs

Things that are broken or incomplete in features that have already been built. These represent real defects or gaps in existing functionality — not new work — and should be fixed before Keep Track goes to production.

- **Report PDF styling** needs review and improvement — charts and layout should match the quality of the manually built KHOC report template.

---

## Section 2 — V1 Features

Features that have been designed and committed to for V1, but are not yet built. Unlike Section 1, these aren't broken — they simply don't exist yet. All of these are required before Keep Track goes to production.

- **Production Packaging** (last task before deployment):
  - Multi-stage Docker builds (frontend compiled, not served via the Vite dev server).
  - Nginx serving the frontend in production.
  - Gunicorn running FastAPI in production.
  - Reverse proxy ready (X-Forwarded headers, configurable CORS).
  - Configurable external port in docker-compose.
  - Works behind Traefik, Nginx, Caddy, or a load balancer.
  - Kubernetes manifests for k3s deployment.
  - Container vulnerability scanning (slim/alpine base images, OS updates during build, Trivy integration).
  - A single `docker-compose up -d` starts everything.
  - `docs/deployment.md` — full deployment guide.

---

## Section 3 — V1 Polish

Small improvements that make V1 feel complete and considered, but do not block launch. These can be picked up opportunistically or batched together once the bugs and features above are done.

- **Branding:** consider making "Keep Track" look more like one word visually.
- **Dark mode:** report PDFs do not respect dark mode — PDFs are always light, which is the correct behaviour, but worth noting explicitly so it isn't mistaken for a bug later.
- **Settings → AI & Extraction:** rename or expand the page to make extraction settings clearer (related to the Section 1 bug — this is the longer-term polish once that gap is addressed).
- **MFA issuer:** consider adding the Keep Track logo to the QR code once the app is publicly accessible (currently works best self-hosted, where a logo adds less value).
- **Error log:** review whether the "clear all" UX could be improved further.
- **Help guides:** review all content for accuracy after recent changes.
- **Transaction rules** — auto-categorise invoices by supplier name. Define rules like "Any invoice from Corona Energy → Electricity". Rules applied automatically during AI extraction and manual review. Works even when AI is disabled. Rules manageable in Settings. Improves categorisation accuracy over time.
- **Cash flow enhancement** — update the dashboard financial chart to show separate income and expense visualisations more clearly, inspired by Actual Budget's cash flow report. Show how available funds fluctuate month by month with income and expenses as distinct areas.

---

## Section 4 — V2 Wishlist

Longer-term ideas for future versions of Keep Track. These are explicitly out of scope for V1 — useful to keep visible so good ideas aren't lost, but none of them should be pulled into V1 scope without a deliberate decision to do so (and, if that happens, a note in [decisions-log.md](decisions-log.md) explaining why).

- **Folder Integration housekeeping** — automated cleanup/archiving of the watched input folder's `processed/` subfolder (currently a manual task — see [user-guides/folder-integration.md](../user-guides/folder-integration.md)).
- **Folder Integration output workflows** — beyond a raw filesystem/SMB write: email, Google Drive, SharePoint, or a webhook as additional (or alternative) output destinations for signed PDFs.
- **Multi-account support** — track multiple bank accounts separately (current, savings, ISA, etc).
- **SSL configuration in app** — Let's Encrypt auto-renewal and manual certificate upload via Settings.
- **Secrets management** — move from `.env` to Docker secrets or k3s secrets.
- **MFA QR code logo** — embed the Keep Track logo once the app is publicly accessible.
- **Profile picture:** improve Gravatar integration.
- **DiceBear avatar integration** — support DiceBear avatar generation (dicebear.com) as a third avatar option on the profile page, alongside photo upload and Gravatar. Fetch and cache server-side using the same pattern as the Gravatar implementation. Allow users to customise their DiceBear style and seed before fetching.
- **Dark mode for exported PDFs** — a user preference for PDF colour scheme.
- **Notification centre:** email notifications for critical alerts.
- **Full text search:** extend to contributions and reconciliation notes.
- **Debt tracking enhancements to V2** (avalanche/snowball strategies, debt-to-income ratio, net worth over time chart) — point-in-time net worth (funds on hand minus total debt) is already a dashboard metric once Debt Tracking is enabled; a historical chart of it over time is not yet built.
- **Budget Planning enhancements:** full envelope budgeting with income allocation, copy budget from last month, per-category rollover configuration, a heatmap grid view, spending trend charts (on the Budget Planning page itself, distinct from the reports PDF table already built), and mobile optimisation for the Budget Planning page.
- **Savings goals linked to projects:** when a project is funded, mark the savings goal as complete.
- **Import enhancements:** support for bank statement CSV formats (Barclays, HSBC, Monzo, etc).
- **API:** a public REST API for third-party integrations.
- **Mobile app:** a native iOS/Android app (currently responsive web only).
- **Multi-tenancy:** one Keep Track instance serving multiple organisations with complete data separation.
- **Webhooks:** trigger external actions when invoices are confirmed, projects completed, etc.
- **Two-factor backup codes:** generate one-time backup codes for MFA recovery without the Superadmin account.
- **Scheduled reports:** automatically generate and email reports on a schedule.
- **Bank feed integration:** connect directly to bank accounts via open banking APIs (UK: Plaid, TrueLayer).
- **Receipt scanning:** scan paper receipts with a phone camera.
- **OCR enhancement:** improve extraction for handwritten or poor-quality scanned invoices.
- **Accessibility audit:** full WCAG 2.1 AA compliance review.
- **Internationalisation:** support for non-UK currencies, date formats, and languages.
- **Plugin system:** allow third-party developers to build Keep Track modules.
- **Data retention policies:** configurable per data type.
- **Advanced reporting:** a custom report builder with drag-and-drop sections.
- **Budget Planning:** support for irregular income (freelancers, commission-based).
- **Debt Tracking:** support for joint debts shared between users.
- **Net worth dashboard:** assets vs. liabilities overview.
- **Tiled report dashboard** — Reports page shows saved and pinned reports as clickable tiles (mini previews) rather than just a list. Clicking a tile expands to full screen. Users can pin their most used reports for quick access. Inspired by Actual Budget's report dashboard.
- **Scheduled transactions** — define expected recurring invoices (e.g. electricity bill expected on the 1st of each month for approximately £X). App tracks whether they arrived and alerts if an expected invoice is overdue. More structured than the current upcoming invoices panel which is pattern-based.
- **Transaction import formats** — support importing transactions from popular financial file formats: QIF, OFX, QFX, CSV. Inspired by Actual Budget's import capabilities. Complements the existing CSV import for historical data.
- **Bank sync** — connect directly to UK bank accounts via GoCardless open banking API for automatic transaction import. Inspired by Actual Budget's bank sync feature.
