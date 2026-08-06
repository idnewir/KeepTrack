# Features

This document describes every feature area of Keep Track in detail. It is the reference for what the app should do; implementation follows this spec.

---

## 1. Invoice Management

### Getting invoices in
- **Drag and drop** upload onto the Invoices page.
- **Browse button** as a fallback for drag-and-drop.
- **Watched folder** — a configured SMB/NFS network folder is monitored continuously; any PDF dropped there is picked up automatically and enters the same pipeline as a manual upload.

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
- **Watched folder path configuration** — set the SMB/NFS path the folder-watcher monitors.
- **Financial year configuration** — set the start/end dates for financial years (default September–August) and manage the opening balance for a new year.

---

## 9. Account Sheet / Ledger

- A **monthly ledger** view showing:
  - Contributions in, broken down by contributing group.
  - Invoices out.
- **Opening balance** for each month is carried forward automatically from the previous month's closing balance.
- **Monthly reconciliation** against the actual bank balance, with discrepancy flagging and suggested reasons (see Financial Year & Balance, above).
- **Total funds on hand** is always visible from the ledger view (and the dashboard).
