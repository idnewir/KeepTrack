# Project Backlog

**Last updated:** 2026-08-07

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
- **Gravatar avatar URL** doesn't work reliably — likely a Gravatar-side issue, but worth investigating properly rather than assuming.
- **Help guides are duplicated** in two locations (`user-guides/` and `frontend/public/help-guides/`) — editing one does not update the other, so the two can silently drift out of sync.

---

## Section 2 — V1 Features

Features that have been designed and committed to for V1, but are not yet built. Unlike Section 1, these aren't broken — they simply don't exist yet. All of these are required before Keep Track goes to production.

- **Folder Integration module:**
  - Input watched folder — auto-import PDFs from a network folder.
  - Output folder — auto-export signed PDFs when confirmed.
  - Setup prompt on enable.
  - Settings configuration in Settings → Data.
  - Docker volume for folder mounts.
  - User guide.

- **Debt Tracking module** (toggleable, default OFF):
  - Flexible debt records (credit card, loan, mortgage, car finance, overdraft, BNPL, other).
  - Fields: name, type, current balance, credit limit, monthly payment, payment due date, start date, expected end date, interest rate, rate type (standard/promotional/0%), promotional end date, standard rate after promotion, notes.
  - Payoff calculator — months remaining, total interest, total to pay, warning if payment is below interest.
  - Terminology configurable within module settings.
  - Setup prompt on enable.
  - Dashboard integration — total debt, monthly payments.
  - User guide.

- **Budget Planning module** (toggleable, default OFF):
  - Monthly budget envelopes per category.
  - Income allocation across categories.
  - Terminology configurable within module settings.
  - Setup prompt on enable.
  - Dashboard integration.
  - Distinct from Projects — budgeting, not saving.
  - User guide.

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
  - Help guides consolidated into a single source (depends on the Section 1 duplication bug being fixed first).
  - `docs/deployment.md` — full deployment guide.

---

## Section 3 — V1 Polish

Small improvements that make V1 feel complete and considered, but do not block launch. These can be picked up opportunistically or batched together once the bugs and features above are done.

- **Branding:** tighten spacing between the logo icon and the wordmark.
- **Branding:** consider making "Keep Track" look more like one word visually.
- **Dark mode:** report PDFs do not respect dark mode — PDFs are always light, which is the correct behaviour, but worth noting explicitly so it isn't mistaken for a bug later.
- **Settings → AI & Extraction:** rename or expand the page to make extraction settings clearer (related to the Section 1 bug — this is the longer-term polish once that gap is addressed).
- **MFA issuer:** consider adding the Keep Track logo to the QR code once the app is publicly accessible (currently works best self-hosted, where a logo adds less value).
- **User management:** add permanent delete with GDPR anonymisation.
- **Error log:** review whether the "clear all" UX could be improved further.
- **Callout tooltips:** hovering over notifications/errors should give an explanation.
- **Report footer:** confirm the instance name appears correctly on all pages.
- **Dashboard:** review all panel sizes and spacing for consistency.
- **Invoice table:** review column widths and spacing.
- **Welcome page:** review copy for personal finance vs. organisational tone.
- **Help guides:** review all content for accuracy after recent changes.
- **Audit log:** confirm all actions are being captured correctly.

---

## Section 4 — V2 Wishlist

Longer-term ideas for future versions of Keep Track. These are explicitly out of scope for V1 — useful to keep visible so good ideas aren't lost, but none of them should be pulled into V1 scope without a deliberate decision to do so (and, if that happens, a note in [decisions-log.md](decisions-log.md) explaining why).

- **Multi-account support** — track multiple bank accounts separately (current, savings, ISA, etc).
- **SSL configuration in app** — Let's Encrypt auto-renewal and manual certificate upload via Settings.
- **Secrets management** — move from `.env` to Docker secrets or k3s secrets.
- **MFA QR code logo** — embed the Keep Track logo once the app is publicly accessible.
- **Profile picture:** improve Gravatar integration.
- **Dark mode for exported PDFs** — a user preference for PDF colour scheme.
- **Notification centre:** email notifications for critical alerts.
- **Full text search:** extend to contributions and reconciliation notes.
- **Debt tracking enhancements:** debt payoff strategies (avalanche/snowball), debt-to-income ratio, net worth calculation.
- **Budget Planning enhancements:** budget vs. actual comparison charts, spending trends, category budget rollover.
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
