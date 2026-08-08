# Settings Guide

Settings control how Keep Track behaves for everyone. This guide walks through every section of Settings, what it configures, and who can see or change it. Most sections are only available to Administrators.

## Who can access Settings

Most of Settings is only available to **Administrators** (and the Superadmin recovery account). Standard and Read-only users can now open Settings too, but they'll only see **General → Feature Modules** — everything else stays Admin-only. See [Feature Modules](feature-modules.md) for the full picture of what modules are and how they work; this guide covers just how to turn them on and off.

Settings is laid out as a two-panel page: a list of sections on the left, and the selected section's content on the right. On a phone or narrow screen, picking a section replaces the list with its content, and a **← Back to Settings** link takes you back to the list.

The sections, in the order they appear, are: **General**, **Appearance**, **Security**, **AI & Extraction**, **Users & Access**, **Notifications & Logs**, and a **Data** group (Import Data, Folder Integration, Storage & Backup, System Reset).

## General

To get there: **Settings → General**.

### Feature Modules

This is where you turn whole feature areas of Keep Track on or off — Reconciliation, Planned Projects, AI Extraction, and more. It's what makes the same installation work for a full charity committee or a stripped-down personal budget tracker, without menus for features you'll never use. Full detail on what each module does and what happens to your data is in the dedicated [Feature Modules](feature-modules.md) guide — this section is just the how-to for the toggle itself.

- Each module shows its **name**, a one-line **description**, an **Active**/**Inactive** status, and a toggle switch.
- **Standard and Read Only users** see the same list, with a note to contact an Administrator — the toggle is greyed out and can't be clicked.
- **To turn a module on:** click its toggle. It switches on immediately, with a confirmation message. If the module needs a little extra setup (AI Extraction, Folder Integration, Debt Tracking, or Budget Planning — see below), a short prompt appears straight after — you can act on it right away or click **Skip for now** and come back to it later.
- **To turn a module off:** click its toggle, then confirm. Keep Track is explicit that this only hides the module from navigation — nothing is deleted, and turning it back on brings everything back exactly as it was, instantly.
- Changes reach every other open tab or session within about 30 seconds; the person making the change sees it immediately.

### Instance name

Give this installation a name of its own — your organisation's name, or just "Personal" — shown in the header next to the Keep Track logo (e.g. "Keep Track — KHOC"). Leave it blank if you don't want anything extra shown.

### App start date

Months before this date are hidden across the whole app, so you don't see empty rows and zero values for months before you actually started tracking anything — handy if your financial year began earlier than when you set Keep Track up. This is optional; leave it unset and every month is shown. It's first asked during the setup wizard (see [Getting Started](getting-started.md)) but can be changed here at any time.

### Financial year start month

The month your financial year begins — September is common for UK charities, but pick whatever fits. Keep Track organises all data (dashboard, reports, reconciliation) around this date. Changing it partway through the year affects how existing data is grouped and displayed, so Keep Track asks you to confirm before applying a change.

### Categories

Categories are what invoices get classified against (Electricity, Water, Broadband, and so on). Keep Track comes with seven ready to use — Electricity, Water, Broadband, HVAC, Alarm, Supplies, and General Maintenance — but you can add, rename, recolour, or retire them to fit your own organisation.

Click **Manage categories** on the General page to go to the dedicated Categories page (only Admins see this button).

- **View categories** — the page lists every category with its colour, name, and whether it's Active or Inactive.
- **Add a category** — click **+ Add category**, type a name, pick a colour, and save. The colour is used consistently for that category everywhere it appears (charts, tables, badges).
- **Edit a category** — click **Edit** next to it to rename it or change its colour, then **Save**.
- **Deactivate a category** — click **Deactivate**, then confirm with **Yes, deactivate**. This doesn't delete it — any invoice already using that category keeps it — it just won't be offered as an option for new invoices.
- **Restore a category** — if you've deactivated one by mistake, or need it again, click **Restore** to bring it back to Active.

Category names must be unique — Keep Track will tell you if you try to add or rename one to something already in use.

### Target Reserve

The target reserve (whatever you've renamed it to — see Terminology, below) is the dashboard gauge that shows how your current balance compares to a healthy amount held in reserve.

- **Automatic** (the default) — Keep Track works out your average monthly spend over the last 3 months and multiplies it by a **months multiplier** you choose (1–12, default 3). For example, a multiplier of 3 targets three months' worth of average spend held in reserve.
- **Manual** — set a fixed £ amount yourself instead of letting Keep Track calculate one. Useful if your organisation already has an agreed reserve figure.

Whichever method you choose, the dashboard gauge shows the calculation method underneath it in small text, so everyone can see how the target was arrived at.

## Appearance

To get there: **Settings → Appearance** (Admin only).

Dark mode itself isn't set here — that's a per-user toggle in the header, available to everyone regardless of role. This page is for the labels Keep Track uses throughout the app.

### Terminology

Keep Track ships with charity-style names for things — "Invoices," "Contributions," "Projects," "Reconciliation," "Target Reserve" — but not everyone using it is a charity. If you're tracking a personal budget or running a small business, you can rename these labels so the app reads naturally for you.

- **Expenses label** — what to call money going out. Default: *Invoices*. Try *Bills* or *Expenses*.
- **Income label** — what to call money coming in. Default: *Contributions*. Try *Income*, *Revenue*, or *Membership Fees*.
- **Projects label** — what to call planned future spend. Default: *Projects*. Try *Future Expenses* or *Planned Spend*.
- **Reconciliation label** — what to call matching the calculated balance against the bank. Default: *Reconciliation*. Try *Monthly Check* or *Bank Reconciliation*.
- **Reserve label** — what to call the target reserve on the dashboard gauge. Default: *Target Reserve*. Try *Rainy Day Fund* or *Savings Goal*.
- **Site/instance name** — the same field as **Instance name** under General, shown here too for convenience.

As you type, a small **live preview** shows how the sidebar will look with your new labels, before you save anything.

- Click **Save all** to apply every field at once. The sidebar, page titles, notifications, and dashboard update immediately for everyone — no page refresh needed.
- Click **Reset to defaults** to put every label back to its original charity-style wording. You'll be asked to confirm first, since this affects everyone.

Every guide in this help section uses the default labels (Invoices, Contributions, Projects, Reconciliation) for clarity — if you've renamed them here, just mentally swap in your own wording as you read.

### Debt Tracking terminology

Only shown when the [Debt Tracking](feature-modules.md) module is switched on.

- **Module name label** — default *Debt Tracking*.
- **Debt label** — default *Debt*. Try *Loan* or *Balance*.
- **Payment label** — default *Payment*. Try *Repayment* or *Instalment*.

Just like the main Terminology section above, these labels update throughout the app automatically once saved — the sidebar link, page headings, and buttons on the Debts pages all pick up the new wording immediately, no page refresh needed. See the [Debt Tracking](debt-tracking.md) guide for everything else the module does.

> **Note:** enabling the Debt Tracking module also switches the Dashboard to **Personal Finance mode** automatically — this isn't a separate setting to turn on, it happens as soon as the module is enabled. See [Debt Tracking](debt-tracking.md#how-the-personal-finance-dashboard-works) for what changes.

### Budget Planning terminology

Only shown when the [Budget Planning](feature-modules.md) module is switched on.

- **Module name label** — default *Budget Planning*. Try *Envelopes*.
- **Budget label** — default *Budget*. Try *Allowance* or *Envelope*.
- **Savings goal label** — default *Savings Goal*. Try *Sinking Fund*.

Just like Debt Tracking terminology above, these labels update throughout the app automatically once saved — the sidebar link, tab names, and buttons on the Budget Planning page all pick up the new wording immediately, no page refresh needed. See the [Budget Planning](budget-planning.md) guide for everything else the module does.

## Security

To get there: **Settings → Security** (Admin only).

### Signing and export

A single on/off switch controls the invoice-signing step for the whole organisation:

> When enabled, users will be asked to sign and date invoices before confirming them. Turn this off for personal use cases where signing is not required.

- **On** (the default) — everyone will be asked to sign and date invoices (see [Reviewing and Signing](reviewing-and-signing.md)) before they're confirmed; the signed PDF downloads automatically and is kept alongside the original.
- **Off** — invoices are confirmed straight away after review, with no signing step — the review card's button simply reads **Confirm**.

Changing this switch takes effect immediately for everyone, including anyone partway through reviewing an invoice.

### Session timeout

How long someone can be inactive before Keep Track logs them out automatically — 30 minutes, 1, 2, 4, or 8 hours, or **Never**. A warning appears 5 minutes before the timeout fires, giving anyone still there a chance to stay logged in.

### MFA remember duration

How long a "remember this device" choice lasts after someone verifies their MFA code at login, before they're asked for a fresh code again — from 4 hours up to 7 days.

## AI & Extraction

To get there: **Settings → AI & Extraction** (Admin only).

This controls how Keep Track reads uploaded invoices automatically and writes the narrative summaries in exported reports.

- **Enable AI features** — an on/off switch for the whole organisation.
  - **On** (the default) — invoices are read automatically on upload, and reports include a written AI summary.
  - **Off** — every invoice field must be filled in by hand on the review card, and reports are generated without a summary. Nothing about uploading, reviewing, or reporting stops working — AI is simply skipped.
- **Provider** — choose which AI service does the reading and writing:
  - **Anthropic** (recommended, and the default)
  - **OpenAI**
  - **Google Gemini**
  - **xAI Grok**
  - **Mistral**
  - **Cohere**
  - **Ollama** — a model you run yourself, on your own hardware or network. No data leaves your own infrastructure.
  - **Custom** — any other service that speaks the OpenAI-compatible API format.
- **API key** (Anthropic, OpenAI, Gemini, Grok, Mistral, Cohere) — click **Change API key** to enter a new one. Once saved, it's shown only as dots — Keep Track encrypts it before storing it and never displays it again. A green **API key configured** badge confirms one is set; an amber banner tells you if one is missing and AI features won't work until you add one.
  - If you'd rather manage the key outside the app (an environment variable on the server), Keep Track will say so with a blue banner and use that instead — setting a key here simply overrides it.
- **Model** — pick from the list of models available for whichever provider you've chosen.
- **Endpoint URL** (Ollama and Custom only) — the address of your self-hosted or custom service, e.g. `http://192.168.1.100:11434`. For Ollama, Keep Track can fetch the list of models actually installed there — click **Fetch installed models**. Ollama needs no API key.
- **Test connection** — sends a real, tiny test message to whichever provider is currently configured and reports back whether it worked, how long it took, and which model answered — without touching any of your invoices or reports. Limited to 10 tests per hour to avoid running up unnecessary usage.
- **Save** — applies your changes immediately, for everyone, with no page refresh needed.

If an invoice's fields come back empty after upload, it usually means AI extraction couldn't read that particular document — just fill them in by hand on the review card as normal. If this keeps happening, check this page for a misconfigured or missing API key. This is also the first place to look if AI features seem to have stopped working after previously working fine — see [Feature Modules](feature-modules.md#ai-degradation--what-works-without-ai) for what still works even with AI switched off entirely.

AI is also configured as part of the first-run setup wizard — see [Getting Started](getting-started.md) — but can always be changed here afterwards.

## Users & Access

To get there: **Settings → Users & Access** (Admin only). There are two tabs — **Active users** and **Pending approval**.

### Active users

A table of every approved account, showing their name/username, email, role, when they joined, when they last logged in ("Never" if they haven't yet), and whether they're Active or Inactive.

- **Change a role** — pick a new role directly from the dropdown in the Role column. Changes take effect immediately.
- **Reset a password** — click **Reset password**, confirm, and Keep Track generates a random 8-character temporary password on the spot. Copy it and share it with the user yourself (by whatever secure means you'd normally use) — Keep Track doesn't email it. The user must set their own new password the next time they log in before they can do anything else.
- **Deactivate an account** — click **Deactivate** and confirm. A deactivated user can no longer log in ("Your account has been deactivated. Please contact an Administrator.") but their history (invoices, contributions, etc.) is untouched.
- **Reactivate an account** — click **Reactivate** on an inactive user to restore their access.
- **Permanently delete an account** — click **Delete** and confirm to erase a former user's personal data for good, per GDPR's "right to erasure". See below.

You can't change the role of, reset the password of, deactivate, or delete **your own account** or the **Superadmin account** — those actions are hidden for those rows. The Superadmin account can never be deactivated or deleted, since it's the recovery login for when every Admin account is locked out or forgotten.

#### Permanently deleting a user

Deactivating an account (above) is the normal way to remove someone's access — it's instant and fully reversible, and every record they ever created keeps showing their real name. **Permanent deletion is different: it's a one-way action for someone who has genuinely left and asked for their personal data to be erased**, and it can't be undone.

An account must already be **Inactive** before it can be deleted — the **Delete** button stays greyed out (with a "Deactivate user before deleting" tooltip) until you've deactivated them first. This two-step requirement exists so permanent deletion can never happen by accident: deactivating is the easy, everyday action; deleting is a deliberate second step you take only once you're sure.

Clicking **Delete** opens a confirmation window that explains exactly what will happen, and won't let you proceed until you type **DELETE USER** exactly (case sensitive) into the confirmation box. Once you confirm:

- Their profile picture and signature are deleted from storage.
- Their login credentials, MFA setup, and any notifications are permanently removed — they can never log in again, even if you had their password.
- Every invoice, contribution, reconciliation, project, report, budget, savings goal, and debt record they ever created **stays exactly as it was** — nothing about the financial history changes — but the "created by" / "recorded by" attribution on those records is cleared, so they no longer show the deleted person's name.
- Their entries in the audit log are kept (not deleted) but anonymised in the same way, with **[Deleted User]** added to the description so the trail of what happened is still readable without naming them.

In short: **the person is erased, the financial record isn't.** This keeps Keep Track's accounts and audit trail intact for accounting/compliance purposes while still honouring a genuine erasure request. See [decisions-log.md](../docs/decisions-log.md) for the reasoning behind this split.

### Pending approval

Anyone who self-registers shows up here first, with their username, email, and registration date.

- **Approve** — pick their role from the dropdown (Admin, Standard, or Read only) and click **Approve**. They can log in from that point on.
- **Reject** — click **Reject** and confirm to turn away a registration you don't recognise or don't want. This removes the registration entirely; they'd need to register again if that was a mistake.

## Notifications & Logs

To get there: **Settings → Notifications & Logs** (only Admins and the Superadmin see this section). There are two tabs — **Notifications** and **Logs**.

The **Notifications** tab is reserved for upcoming notification preferences (which alerts you receive, and when) and doesn't have anything to configure yet. **Logs** is where the real content is today.

Keep Track automatically manages your logs to keep the app fast and your data clean. Audit logs are archived every 90 days — archived entries are kept permanently and can be exported at any time. Error logs are automatically deleted after 90 days. These settings cannot be changed to ensure data integrity.

### Audit log

A record of who did what and when — logins, uploads, edits, deletions, approvals, settings changes, and more. The status bar at the top shows how many entries are currently active (the last 90 days), how many have been permanently archived, and when the log was last archived.

- **Filter** by user, action type, or a date range.
- **Click a row** to expand it and see full detail — before/after values for an edit, the IP address for a login, or which record was affected.
- Rows are colour-coded down the left edge: green for things being created, blue for edits and updates, amber for settings changes, and red for deletions and security events (failed logins, deactivations, a system reset).
- **Include archive** — tick this to switch the table over to the permanent archive instead of the last 90 days. A banner makes it clear you're looking at archived, read-only history.
- **Archive now** — normally archiving happens automatically every 90 days, but an Admin can trigger it immediately from here if needed.
- **Export CSV** — exports whatever's currently filtered (and switches to exporting the archive too, if that toggle is on).

### Error log

A rolling record of things that went wrong in the background — a failed AI extraction, a PDF that couldn't be signed, a failed login, or an unexpected error — kept for 90 days and then automatically deleted. The status bar shows the total in the last 90 days, a breakdown by severity, and when the log was last cleaned up.

- **Filter** by severity, source, or a date range.
- **Click a row** to see the full technical detail (stack trace), useful if you need to pass it on for troubleshooting.
- Severity is shown as a coloured badge: blue for Info, amber for Warning, red for Error, and a pulsing dark red for Critical — critical entries are worth checking promptly.
- If any critical errors appear in the last 7 days, Admins and the Superadmin see a banner on the Dashboard linking straight here.
- **Export CSV** — exports whatever's currently filtered.

## Data

A group of Admin-focused sections in the sidebar, expandable by clicking **Data**: **Import Data**, **Folder Integration**, **Storage & Backup**, and **System Reset**.

### Import Data

To get there: **Settings → Data → Import Data**.

The same historical-import workspace described in detail in [Uploading Invoices](uploading-invoices.md#bringing-in-historical-data-bulk-import) — CSV import, PDF import, and Import history all live here. It's reached this way from Settings, or directly from the **Import** link in the main sidebar; both point at the same page.

### Folder Integration

To get there: **Settings → Data → Folder Integration** (Admin only; the [Folder Integration](feature-modules.md) module must be switched on first).

Configure a watched input folder that Keep Track automatically imports new invoices from, and/or an output folder that signed PDFs are automatically saved to. Supports both local paths (Docker volumes) and SMB network shares, with connection testing, a live status panel, and an activity log. Full detail — including SMB and NFS setup steps, duplicate detection, and troubleshooting — is in the dedicated [Folder Integration](folder-integration.md) guide.

### Storage & Backup

To get there: **Settings → Data → Storage & Backup** (Admin; restoring is Superadmin only).

This is where invoice files, signed PDFs, and reports live on disk, and where you back up and
restore your whole Keep Track installation. For the full technical detail, see
[docs/storage-and-backup.md](../docs/storage-and-backup.md).

#### Storage location

The top card shows where your files currently live, how much space they're using in total, and a
breakdown (with a small usage bar) across original PDFs, signed PDFs, and generated reports.

- **Change storage path** — move Keep Track's files somewhere new (a different volume, a mounted
  NAS share, and so on). Enter the new path, leave **Move existing files to new location** switched
  on (the default) so nothing breaks, and confirm. Keep Track shows a progress state while it moves
  everything and updates every invoice and report's link to match — if anything goes wrong partway
  through, it automatically puts everything back the way it was rather than leaving things
  half-moved. Turning the move switch off just changes the setting without moving anything — Keep
  Track will warn you clearly that every existing file link will break until you move the files
  there yourself.

#### Backups

- **Last backup** shows the date, size, and whether it was manual or scheduled — or "Never" if
  you haven't backed up yet.
- **Create manual backup** — click it, and after a short wait (backups can take a while for a
  large amount of data) your browser downloads a zip file containing everything: your database,
  every file, and a summary of what's inside. Manual backups are never deleted automatically, so
  keep as many as you like.
- **Scheduled backups** — set a schedule (Daily, Weekly, or Monthly), a destination path for Keep
  Track to save them to automatically, and how many to keep. Once a scheduled backup pushes you
  over that number, the oldest scheduled ones are cleaned up automatically — manual backups are
  never touched by this.

#### Restore from backup

This is clearly separated and marked with a warning, because **restoring replaces all current
data and cannot be undone.** Only the Superadmin account can do it.

1. Choose a Keep Track backup `.zip` file.
2. Keep Track reads it and shows you a preview — when it was made, how many of each record it
   contains, how many files, and a warning if the backup's Superadmin account doesn't match this
   installation's.
3. Enter the Superadmin password and click **Confirm restore**.

Once confirmed, Keep Track briefly stops accepting other requests while it restores your database
and files, then signs everyone out — including you — so make sure you're ready to log back in
straight afterwards.

#### Backup history

If you've set a backup destination path, every backup saved there is listed here with its
filename, date, size, and type, each with its own **Download** and **Delete** (with confirmation)
button. If no destination is configured yet, this stays empty — set one in the Backups section
above.

> Scheduled backups are retained based on your configured count. Manual backups are never
> automatically deleted. Store backups in a secure location — they contain all your data,
> including user accounts.

### System Reset

To get there: **Settings → Data → System Reset** — sometimes called the "Danger Zone." Only the **Superadmin** recovery account can see or use this — not even a regular Administrator can. It permanently erases everything in Keep Track and puts it back exactly as it was the day it was installed.

**What it deletes:**

- All invoices and their uploaded PDF files (only if you also choose to wipe files — see below)
- All contributions and reconciliations
- All planned projects
- All reports
- Every user account except the Superadmin account itself
- All settings, reset back to their defaults
- All categories, reset back to the original seven (Electricity, Water, Broadband, HVAC, Alarm, Supplies, General Maintenance)

Nothing survives except the Superadmin account. The next person to visit Keep Track will see the first-run setup wizard, exactly as if it had just been installed.

**When to use it:** this is for starting completely over — decommissioning a test/demo instance, handing the same installation to a different organisation, or recovering from data you no longer trust and want to wipe rather than fix by hand. It is not for correcting a single mistake; for that, edit or delete the individual record instead.

**How it works:**

1. **Wipe files** — an optional toggle, off by default. Turn it on to also permanently delete every original and signed PDF from storage, not just the database records pointing to them. Keep Track warns you clearly once this is switched on — make sure you have copies elsewhere first if you might need them.
2. **Type the confirmation phrase** — you must type `RESET KEEP TRACK` exactly. The **Reset all data** button stays greyed out until you do.
3. **Enter your Superadmin password** — this field only appears once the phrase above is correct. Keep Track checks it against your real password before doing anything.

Only once all three are satisfied does **Reset all data** become clickable. After a successful reset you're signed out automatically and taken straight to the setup wizard to start again.

For security, every reset attempt — whether it succeeds, fails, or is blocked — is written to a permanent internal log that a reset itself can never erase, and the endpoint only allows 3 attempts per hour to protect against someone trying to guess the Superadmin password.

**This cannot be undone.** There is no confirmation email, no recycle bin, and no way to recover the data afterwards.

## Tips

- Changes to settings apply immediately for all users.
- If you're not sure about changing a setting, check with whoever set up Keep Track for your organisation first — some settings (like the financial year) are hard to change safely partway through the year.

## Related guides

- [Getting Started](getting-started.md) — the first-run setup wizard, which configures some of the same settings covered here.
- [Feature Modules](feature-modules.md) — the full picture of what each module does, referenced throughout this guide.
- [Folder Integration](folder-integration.md) — full setup detail for the Folder Integration section above.
- [Debt Tracking](debt-tracking.md) and [Budget Planning](budget-planning.md) — the modules behind the Appearance terminology sections above.
- [Uploading Invoices](uploading-invoices.md) — the historical import workflow behind Data → Import Data.
