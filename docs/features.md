# Features

This document describes every feature area of Keep Track in detail. It is the reference for what the app should do; implementation follows this spec.

---

## 1. Invoice Management

### Getting invoices in
- **Drag and drop** upload onto the Invoices page.
- **Browse button** as a fallback for drag-and-drop.
- **Watched folder** — a configured local or SMB network folder is monitored continuously; any PDF dropped there is picked up automatically and enters the same pipeline as a manual upload. See [Folder Integration](#11-folder-integration), below.

### AI extraction
- On upload, the backend sends the PDF (text and/or rendered image) to the Anthropic API, which extracts:
  - **Date** (invoice date)
  - **Supplier**
  - **Amount**
  - **Category** (best-guess match against the active category list)
  - **Notes** (any other relevant detail worth recording)

### Review card
- Before anything is committed to the database, the user sees a **review card**:
  - PDF preview on one side.
  - Extracted fields on the other, **all editable**.
  - The user can correct any field the AI got wrong before confirming.
- **Duplicate detection** — the AI flags likely duplicates (e.g. same supplier, amount, and a close date to an existing invoice) so the user can check before confirming.

### Signing (optional workflow)
- At the review stage, if signing is enabled, the user can:
  - Drag a signature onto the PDF preview.
  - Resize and reposition it freely.
  - Have the current date applied alongside the signature.
- The signed PDF is saved locally (alongside the original) and can be exported/downloaded to the user's device.
- **Signing and export is toggleable in Settings** — organisations or individuals that don't need a signed audit trail can turn this off entirely, and the review step skips straight to confirmation.

### Confirmation
- Once the user is happy with the fields (and has signed, if applicable), they confirm and the invoice is written to the database, associated with the current financial year.

### Linking to a planned project
- On the review card, below the category field, an optional **"Link to project"** searchable dropdown lists all active planned projects (with their estimated cost) so an invoice can be tied to the project it belongs to. Left unset by default — linking is entirely optional.
- On the invoice detail page, a linked invoice shows a clickable project name badge (navigating to that project's detail page) below the category field, with an **"Unlink from project"** action (confirmation required) for Standard and Admin users.
- Linking is many-invoices-to-one-project — every confirmed invoice linked to a project counts toward that project's actual spend (see Planned Projects, below).

---

## 2. Categories

- Categories are **fully manageable from within the app**: add, edit (rename), and deactivate (soft-delete, so historical invoices keep their category).
- **Default categories** seeded on install: Electricity, Water, Broadband, HVAC, Alarm, Supplies, General Maintenance.
- Each category has a **name** and a **colour**, used consistently across charts, tables, and badges.
- **No category is hardcoded anywhere in the application** — the full set is driven from the `categories` table, so any organisation can adapt the list to their own needs.

---

## 3. Dashboard

The dashboard is the home page and main financial overview.

### Main chart
- An **area/line chart** plotting three series across the financial year (September–August):
  - Income (contributions)
  - Actual expenses (confirmed invoices)
  - Forecast (projected expenses based on historical patterns, plus planned projects)
- **Planned project spend** appears on the forecast line in a **distinct colour with a marker**, so upcoming one-off costs are visually separated from routine spend.
- The chart is **clickable to drill into detail**:
  - Clicking **income** opens a table of contributions, grouped by contributing group and month.
  - Clicking **expenses** opens a filterable invoice table (filter by category and date).
  - Clicking **forecast** opens a breakdown by category.

### Target reserve indicator
- A **gauge** showing the current balance against a target reserve, calculated as a **3-month rolling average** of expenses.
- Colour-coded: green (healthy), amber (getting low), red (below target).

### Panels
- **Upcoming expected invoices** — predicted based on historical patterns (e.g. "Electricity invoice usually arrives around the 15th").
- **Recent activity feed** — the last few transactions (invoices confirmed, contributions recorded, reconciliations completed).
- **Planned projects** — name, estimated cost, and expected timing for each logged project.

### Quick actions
- Buttons for the most common tasks: **Upload invoice**, **Record contribution**, **Run report**.

### Interactivity
- All charts and visual elements are clickable to drill into the underlying detail — nothing on the dashboard is a dead end.

### Login notifications
On login, the user sees relevant alerts:
- Balance below target reserve.
- Reconciliation overdue.
- An invoice has been sitting in review, unconfirmed, for more than a configurable number of days.
- A duplicate invoice has been flagged.
- An expected invoice (based on historical pattern) has not been received when due.

---

## 4. Financial Year & Balance

- The **financial year runs September to August** (configurable per deployment, but this is the default and the KHOC convention).
- An **opening balance** is entered manually at the start of each financial year.
- **Monthly contributions** are recorded per contributing group (manual entry — see Account Sheet below).
- Keep Track calculates **money on hand** as:

  ```
  money on hand = opening balance + contributions to date − invoices to date
  ```

- **Monthly reconciliation:** the user enters the actual bank balance for the month; the app compares it against the calculated balance and flags any discrepancy, along with a **suggested reason** (see below).
- **Discrepancy suggestions** consider likely causes such as:
  - A missing invoice (spend that happened but hasn't been logged).
  - An unrecorded contribution.
  - A bank charge or interest not reflected in the ledger.

---

## 5. Planned Projects

- Users can log a **planned project**: name, description, estimated cost, and expected timing (month), optionally assigned to a financial year.
- Planned projects are **automatically factored into the forecast** — their estimated cost is added to the forecast line for their expected month.
- Shown on the **forecast chart** in a distinct colour with a marker (see Dashboard, above).
- Shown in the **planned projects dashboard panel**, listing all currently active projects, amber-highlighted if due within 60 days and red if overdue.
- The **Projects page** (`/projects`) lists all active projects — name, description (truncated, expandable), estimated cost, expected month/year, financial year if assigned, status, and a colour-coded days-until-due indicator — with the total estimated upcoming spend shown at the top.
- A project can be **marked complete** (Standard or Admin, with confirmation), which removes it from the active list and the forecast, and moves it into a collapsed **Completed projects** section (visible to Admins). Separately, an **Admin can deactivate** a project (with confirmation) to drop it without marking it complete — both actions turn the project inactive, but only completion sets its distinct "complete" status.

### Tracking actual spend against a planned project
- Invoices can optionally be [linked to a planned project](#linking-to-a-planned-project) at review time or later, so **actual spend** can be tracked against the **estimated cost** — the whole point being to see whether a project is running to budget as invoices for it come in, not just to log the estimate upfront.
- Every project reports, computed live from its linked, confirmed invoices (never stored, so these figures can never drift from the underlying invoice data):
  - **Actual cost** — the sum of every confirmed invoice linked to it.
  - **Variance** — estimated cost minus actual cost (positive is under budget, negative is over), and the same as a percentage of the estimate.
  - **Project status** — one of **Planning** (nothing linked yet), **In progress** (at least one invoice linked, not yet complete or over budget), **Over budget** (actual spend exceeds the estimate), or **Completed** (marked complete — this takes priority over "over budget" once a project is finished).
  - **Invoice count** and the full list of linked invoices (date, supplier, amount, category), each linking through to its own invoice detail page.
- The **Projects page** cards show actual spend, a colour-coded variance (green under budget, amber within 10%, red over), a progress bar (actual vs. estimated), the invoice count, and an expandable "View linked invoices" list.
- Each project also has a full **project detail page** (`/projects/{id}`) — financial summary (estimated cost, actual spend, remaining budget or over-budget amount, variance percentage), a progress bar, a status badge, the full linked-invoices table, and a timeline (created, first invoice linked, completed).
- The **dashboard's planned projects panel** shows actual vs. estimated spend and a mini progress bar for each project, with over-budget projects highlighted; clicking a project opens its detail page.
- The **forecast** treats an in-progress project's *remaining* estimate (estimated cost minus actual spend so far, not the full estimate) as the amount still to come in its expected month — its actual spend to date already shows up in the months those invoices landed in, so the full estimate isn't double-counted on top.
- The **Invoices page** has a project filter (all invoices / unlinked only / each active project by name), making it easy to see all spend recorded against a specific project.
- **Reports** include a project summary section — a table of each project's estimated, actual, and variance figures (with a combined total, and over-budget projects highlighted) — and the AI-written summary calls out any project significantly over or under its estimate by name.

### Funding target mode ("saving toward this project")

- A project can additionally be marked **"I am saving toward this project"** — a distinct mode from ordinary estimated-vs-actual spend tracking, aimed at a savings goal (e.g. "save £3,000 by June") rather than a project whose cost is paid for as invoices land.
- Turning it on adds three fields: a **funding target amount** (pre-fills with the project's estimated cost), a **target date** (pre-fills with the project's expected month), and free-text **notes**.
- Keep Track then computes, live, from the app's overall current balance and recent income/spend trend (never stored, so it can never drift):
  - **Monthly surplus needed** — `(target amount − current balance) ÷ months remaining until the target date`.
  - **On track** — whether the current monthly surplus (recent average income minus recent average spend) meets or exceeds the monthly surplus needed.
  - **Projected completion** — the date the target is reached at the current savings trajectory, if the current surplus is positive.
- Project cards show *"Saving toward: £X,XXX by [date]"*, the monthly surplus needed, and a green tick ("On track") or amber warning ("Behind target") indicator. The dashboard's planned projects panel shows the same savings progress for any funding-target project.
- This is a **different question from estimated-vs-actual project spend** (see above) — a project can, in principle, use both: an estimated cost tracked against linked invoices, and separately a savings goal tracked against the overall balance. See [decisions-log.md](decisions-log.md) for why the two aren't merged into one concept.

---

## 6. Reports

- **Flexible scope:** the user selects a date range and, optionally, one or more categories to include.
- **AI-generated summary:** the Anthropic API is given the full relevant data (invoices, contributions, balances for the selected scope) with careful prompting, and produces a written narrative summary suitable for a general audience (e.g. trustees, family members).
- **Report types:**
  - **Historical analysis** — what happened in the selected period.
  - **Forecast** — what's expected going forward, including planned projects.
- **Export:** reports are exported as a **PDF**, styled consistently with the original KHOC report template already produced for the charity.
- **Access:** any user role, including Read Only, can run and export a report.

---

## 7. User Management & Security

### Login
- Username + password, plus **mandatory TOTP MFA** via an authenticator app (Google Authenticator, Authy, or similar). No email-based login or magic links.

### Onboarding
- The **first user** to access the system after installation is guided through a **setup wizard** and becomes the first **Admin**.
- Every subsequent new user **registers** and is held in a **pending** state until an existing Admin **approves** them and **assigns a role**.

### Roles

| Role         | Summary                                                                 |
|--------------|--------------------------------------------------------------------------|
| Superadmin   | Backdoor account for lockout recovery. Has its own MFA. Not used day-to-day. |
| Admin        | Full access: add/edit/delete data, manage users, change system settings. |
| Standard user| Upload, review, approve, sign, and export invoices. Cannot change settings or manage users. |
| Read only    | View the dashboard, browse data, and run/export reports. Cannot add or change anything. |

Full detail in [user-roles.md](user-roles.md).

- **All roles can run and export reports.**

---

## 8. Settings

Accessible to Admins (and Superadmin); most settings are Admin-only, per [user-roles.md](user-roles.md).

- **Signing & export workflow toggle** — turn the PDF-signing step on or off app-wide.
- **Notification thresholds** — e.g. how many days an invoice can sit unconfirmed in review before it triggers a login notification.
- **Category management** — add/edit/deactivate categories and their colours.
- **User management** (Admin only) — approve pending users, assign/change roles, deactivate accounts.
- **Folder Integration configuration** (Settings → Data → Folder Integration) — set up the watched input folder and the signed-PDF output folder. See [Folder Integration](#11-folder-integration), below.
- **Financial year configuration** — set the start/end dates for financial years (default September–August) and manage the opening balance for a new year.

---

## 9. Feature Modules

Keep Track is deliberately generic (see [project-overview.md](project-overview.md)) — not every deployment needs every feature area. Feature Modules let an Admin turn a whole feature area on or off app-wide, so the same install can serve a full charity committee workflow or a stripped-down personal budget tracker without unused menus and pages getting in the way.

### What a module controls

Enabling or disabling a module only changes **UI visibility and API access** — the background logic behind it (forecasting, reconciliation staleness checks, notification generation, the folder watcher, etc.) always keeps running regardless. This means:

- No data is ever lost or hidden by turning a module off — it's just not shown or reachable.
- Re-enabling a module restores full access **instantly**, with nothing to "catch up" on, since nothing ever stopped running underneath.

### The modules

| Module | Default | Requires setup | Controls |
|---|---|---|---|
| **Reconciliation** | On | No | The Reconciliation page and its sidebar link, plus reconciliation-related dashboard notifications. |
| **Planned Projects** | On | No | The Projects page, its sidebar link, and the dashboard's planned projects panel. |
| **Signing & Export** | On | No | The signing step in the invoice review flow (independent of the pre-existing app-wide signing toggle — see [decisions-log.md](decisions-log.md)). |
| **AI Extraction** | On | Yes | Automatic invoice data extraction on upload, and the Settings → AI & Extraction configuration screens. |
| **Bulk Import** | On | No | The CSV/PDF bulk import workflow and its Settings → Data link. |
| **Full Text Search** | On | No | The header search bar and the search results page. |
| **Folder Integration** | Off | Yes | Auto-import from a watched input folder and auto-export of signed PDFs to an output folder. |
| **Debt Tracking** | Off | Yes | Tracking loans, credit cards, mortgages, and other debts (module name is renameable at setup). See [Debt Tracking](#12-debt-tracking), below. |
| **Budget Planning** | Off | Yes | Annual budgets per category with monthly overrides, budget vs. actual tracking, and savings goals (module name is renameable at setup). See [Budget Planning](#13-budget-planning), below. |

### Enabling and disabling

- **Settings → General → Feature Modules** lists every module with its description, an Active/Inactive status, and a toggle switch. The toggle is visible to every role but only **Admins** can operate it — Standard and Read Only users see it greyed out, with a note to contact an Administrator.
- Turning a module **on** applies immediately (optimistic update), shows a confirmation toast, and — if the module `requires_setup` — opens a short setup prompt (see below). The module appears in navigation immediately for the Admin who enabled it, and within 30 seconds for everyone else (see [architecture.md](architecture.md) for how module state is polled).
- Turning a module **off** asks for confirmation first, explaining that the module will be hidden from navigation but no data will be deleted, and that re-enabling restores full access instantly.
- Every enable/disable is recorded to the audit log.

### Setup prompts

Shown once, right after an Admin enables a module that `requires_setup`:

- **AI Extraction** — points to Settings → AI & Extraction to add an API key.
- **Folder Integration** — points to Settings → Data → Storage & Backup to configure the input/output folder paths.
- **Debt Tracking** / **Budget Planning** — lets the Admin rename the module on the spot (pre-filled with the default name), since neither has one obvious universal label.

Every prompt has a "Skip for now" option — setup is never forced.

---

## 10. Account Sheet / Ledger

- A **monthly ledger** view showing:
  - Contributions in, broken down by contributing group.
  - Invoices out.
- **Opening balance** for each month is carried forward automatically from the previous month's closing balance.
- **Monthly reconciliation** against the actual bank balance, with discrepancy flagging and suggested reasons (see Financial Year & Balance, above).
- **Total funds on hand** is always visible from the ledger view (and the dashboard).

---

## 11. Folder Integration

A [feature module](#9-feature-modules), off by default. When enabled, gives Keep Track two independent, automatic file-handling flows on top of the manual upload/sign/export workflow — configured from **Settings → Data → Folder Integration**. Full walkthrough (including SMB/NFS setup) in [user-guides/folder-integration.md](../user-guides/folder-integration.md).

### Input folder — automatic invoice import
- A configured **local path** (a Docker volume mount) or **SMB network share** is polled on a configurable interval (30 seconds, 1 minute — default, 5 minutes, or 30 minutes).
- Every PDF found directly in the folder's root (not inside `processed/`) is:
  - Checked against a **filename-based duplicate history** — a file whose name has already been successfully imported is flagged (not reprocessed), with an Admin notification offering **View existing invoice** or **Process anyway**.
  - Otherwise run through the same **AI extraction** pipeline as a manual upload, saved to the same original-PDF storage location, and turned into an invoice record.
  - Classified as **historical** (added directly, marked reviewed, skips the review queue) or **needs review** (added to the review queue, same as a manual upload) by comparing its date against the [app start date setting](#8-settings) — see [decisions-log.md](decisions-log.md).
  - Moved into a `processed/` subfolder of the input folder once successfully imported — never deleted.
- A failure processing any individual file is logged, surfaced as an Admin notification, and the file is left in place (not moved to `processed/`) so the next poll retries it.
- Every file the watcher sees — detected, completed, skipped, failed, duplicate-flagged, or duplicate-overridden — is recorded to a folder watcher log, visible as a live status panel (last poll, next poll, files processed today, recent activity) and a full paginated log view on the settings page.

### Output folder — automatic signed PDF export
- The same **local path** / **SMB network share** choice as the input folder, with its own independent configuration.
- An **output behaviour** setting controls what happens when an invoice is signed: **browser download only** (the pre-existing behaviour), **save to folder only**, or **both** (the default once enabled).
- Signed PDFs are written to `/FY{start year}-{end year}/{Month}/{supplier}_{invoice date}_{filename}.pdf` — e.g. `/FY2025-26/August/CoronaEnergy_2026-08-01_invoice.pdf`.
- Writing happens automatically right after a successful sign (`POST /invoices/{id}/sign`), and can also be triggered manually from an already-signed invoice's detail page (**Export to output folder**) — useful as a retry after fixing a connection problem, or for an invoice signed before the output folder was configured.
- A failed write is logged and surfaced as an Admin notification with a retry path (the manual export button above); it never blocks or undoes the signing action itself.

### Connections
- **Local** — a path mounted into the backend container as a Docker volume. Two default volumes (`watched_folder`, `output_folder`) ship in `docker-compose.yml`, mounted at `/data/watched` and `/data/output`; either can be bind-mounted to a real host path.
- **SMB** — connected to directly (no OS-level mount needed), with optional guest access or a username/password (encrypted at rest). A connection timeout and automatic retry (3 attempts, 5 seconds apart) apply to every SMB connection attempt.
- **NFS** — not connected to natively; mount the NFS share at the OS level and point Keep Track's **local path** option at the resulting mount instead. See the user guide for the Proxmox-specific note.
- Both the input and output folder configuration screens have their own **Test connection** button, which reports success (with a file count, for input) or a specific error, without changing anything.

---

## 12. Debt Tracking

A [feature module](#9-feature-modules), off by default, and **personal finance only** — it has nothing to do with KHOC-style organisational running costs, and is aimed at an individual (or household) tracking their own loans, credit cards, mortgages, and similar. See [decisions-log.md](decisions-log.md) for why it's scoped this way rather than folded into Planned Projects. Full walkthrough in [user-guides/debt-tracking.md](../user-guides/debt-tracking.md).

### What it tracks

Each debt records: a name, a type (Credit Card, Loan, Mortgage, Car Finance, Overdraft, Buy Now Pay Later, or Other with a custom label), current balance, an optional credit limit (Credit Card/Overdraft), monthly payment, payment due day, start date, an optional expected end date, an interest rate, a rate type (Standard, Promotional, or 0%/Interest Free), and — for a promotional/0% rate — its end date and the standard rate that applies afterwards. Notes are free text.

### Payment logging

- Payments are logged as a simple amount + date + optional notes — there is no principal/interest split for V1 (see [decisions-log.md](decisions-log.md) for why). Logging a payment reduces the debt's current balance directly.
- If a payment brings the balance to zero or below, the debt is automatically marked **paid off**.
- A debt can also be marked paid off manually at any time (**Mark as paid off**), which zeroes its balance and records the payoff date.
- An Admin can delete a mistaken payment, which restores the balance it had reduced.

### The payoff calculator

Computed live from the debt's current balance, interest rate, and monthly payment — never stored, so it can never drift:

- **Standard rate** — months remaining, total interest to pay, total amount to pay, and an estimated payoff date. If the monthly payment doesn't cover the interest accruing each month, a clear warning is shown instead ("Payment does not cover interest — balance is growing") rather than a misleading month count.
- **Promotional/0% rate** — a **dual scenario** calculator instead: "at the current promotional rate" alongside "once the standard rate applies" (simulating the promotional period month by month, then handing the remaining balance to a standard-rate projection), with the extra interest cost of the standard-rate scenario highlighted directly.
- A dedicated amber warning panel appears on a promotional/0% debt's detail page once its end date is within **30 days** — days remaining, the rate that applies afterwards, and a suggested monthly payment to clear the balance before the rate changes.

### Milestone notifications

Crossing 25%, 50%, 75%, or 100% paid off (by original balance vs. current balance) fires a one-time notification — "Debt milestone reached! You have paid off [X]% of [debt name]! Keep it up!" — recorded in a dedicated table so each threshold **never repeats** for the same debt, even if the balance later rises and falls back across it. See [decisions-log.md](decisions-log.md).

### The balance-over-time chart

A debt's detail page plots its balance over time: actual balance reduction from its logged payment history, projected forward from today based on its monthly payment (and, for a promotional/0% debt, a vertical marker where the rate is projected to change).

### Debt list and sorting

The Debts page (`/debts`) shows total debt, monthly payments due, and the number of active debts at the top, with an **Add debt** button. Debts are shown as cards (balance, rate — styled distinctly for a promotional/0% rate with a countdown — monthly payment, next payment date, and a payoff progress bar coloured green above 50%, amber 25–50%, red below 25%), sortable by highest/lowest interest, largest/smallest balance, next payment due, promotional rate expiring soonest, or most recently added. Paid-off debts collapse into their own section at the bottom, styled distinctly (green, with a tick) from active debts.

### Dashboard integration

Enabling Debt Tracking automatically switches the Dashboard to **Personal Finance mode** — see [decisions-log.md](decisions-log.md) for why this is automatic rather than a separate user preference. Personal Finance mode shows net worth (funds on hand minus total debt), total debt, monthly payments due, and available funds across the top, a debt summary panel, a payments-due-this-month panel, a placeholder savings goals panel (pending the separate Budget Planning module), and the existing income/expenses/forecast chart collapsed by default behind a "Show financial detail" toggle.

### Terminology

Debt Tracking has its own terminology settings (Settings → Appearance → Debt Tracking terminology) — Module name, Debt label, and Payment label — distinct from the app's five global `term_*` labels, since those are fixed to the organisational/charity vocabulary this module doesn't share. See [decisions-log.md](decisions-log.md).

### A daily background check

Independent of the module's enabled state (per the [Feature Modules](#9-feature-modules) rule that background logic always keeps running), a daily check notifies every Admin about any promotional-rate debt whose rate is expiring within 30 days, once per debt per day.

---

## 13. Budget Planning

A [feature module](#9-feature-modules), off by default. It complements invoice management — comparing what was planned against what was actually spent — rather than replacing it with a full income-allocation budgeting system. See [decisions-log.md](decisions-log.md) for why V1's scope stops there. Full walkthrough in [user-guides/budget-planning.md](../user-guides/budget-planning.md).

### Category budgets

- One budget per **category per financial year**: an **annual amount**, plus optional **monthly overrides** for specific months (e.g. a higher figure for Electricity in December/January for heating) — any month without an override falls back to the annual amount divided by 12.
- Every figure Keep Track reports against a budget — the resolved per-month amount, actual confirmed spend, variance, year-to-date totals, percentage used, and status — is **computed live** from the stored `annual_amount`/`monthly_amounts` and confirmed invoices, never stored itself, so it can never drift from the underlying invoice data (the same "compute, don't cache" approach as Planned Projects' actual-vs-estimated tracking).
- "Year to date" sums only the financial year's calendar months that have started on or before today — matching the dashboard's own definition of "elapsed" months, so a Budget Planning percentage never disagrees with the rest of the app about what "so far this year" means.
- **Traffic light status**, per category and per month: **On Track** (under 80% of the relevant budget used), **Warning** (80% or more), **Over Budget** (100% or more).
- Only an **Admin** can set, edit, or remove a budget; any logged-in user can view the overview.

### The Budget Planning page (`/budget`)

- **Budgets tab** — a financial year selector, a **Table view** (a clean row per category with a thin progress bar underneath) or **Card view** (larger gauge-style cards, more visual) toggle — Keep Track suggests Card view by default once Debt Tracking (personal finance) is enabled, Table view otherwise, and remembers the choice per browser. Clicking any category opens its **monthly detail**: budget, actual, variance, and status for every month of the financial year, in FY order, with an **Edit budget** and **Remove budget** action for Admins. An **Unbudgeted categories** section lists any category with actual spend but no budget yet, with a one-click **Set budget** shortcut.
- **Savings Goals tab** — see below.

### Savings goals

- A savings goal has a **name**, optional **description**, **target amount**, **target date**, and an optional **link to a budget category** — the link is purely informational in V1 (it doesn't move spend or affect either figure's totals); see [decisions-log.md](decisions-log.md) for why the two aren't merged.
- Computed live for every goal: **percent complete**, **months remaining**, the **monthly amount needed** to hit the target on time, and an **on track** indicator based on whether the amount saved so far keeps pace with a straight line from the goal's creation date to its target date.
- **Contributions** are logged as a simple amount + optional notes, increasing the goal's current amount immediately. A contribution that reaches or passes the target amount **automatically marks the goal complete** and fires a notification.
- A goal can also be marked complete early, or cancelled (a soft delete — its contribution history is kept, it just stops appearing in the active list) by an Admin.
- Completed goals move into a collapsed **Completed savings goals** section, shown with a completion date.
- Any Standard or Admin user can create, edit, and contribute to a goal; only an Admin can cancel one.

### Dashboard integration

- **Organisational mode** (Debt Tracking disabled): a **Budget Planning** panel appears below the target reserve gauge — an overall traffic-light status, a progress bar of total budgeted vs. total spent, up to three categories that are over budget or in warning, and a link through to the full page.
- **Personal Finance mode** (Debt Tracking enabled): the dashboard's Savings Goals panel — previously a placeholder pointing at Settings — now shows real active goals with their progress and on-track indicators, and a link through to the Savings Goals tab.
- Either panel only appears once the module is enabled.

### Reports integration

- The report generation form gains an **"Include budget vs actual comparison"** checkbox once the module is enabled — ticked by default if any budget exists for the current financial year.
- Turning it on adds a **Budget vs. actual** section to the PDF: each budgeted category's annual budget, actual spend within the report's own date range, variance, percent used, and a colour-coded status, with a totals row. If an AI summary is also included, it calls out any category significantly over or close to its budget by name, the same way it already does for planned projects running over estimate.

### Notifications

- A daily background check (independent of the module's enabled state, per the [Feature Modules](#9-feature-modules) rule) compares each budgeted category's *current month's* actual spend against its budget, and notifies every Admin once per category per month per threshold: at **80% used** (warning) and again at **100% used** (over budget) — each threshold fires at most once per category per month, tracked in a dedicated table so a repeated check never re-notifies the same crossing.

### Terminology

Budget Planning has its own terminology settings (Settings → Appearance → Budget Planning terminology) — Module name, Budget label, and Savings Goal label — distinct from the app's five global `term_*` labels, following the same pattern as Debt Tracking's own terminology. See [decisions-log.md](decisions-log.md).
