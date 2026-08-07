# Settings Guide

Settings control how Keep Track behaves for everyone. Most settings are only available to Administrators.

## Who can access Settings

Most of Settings is only available to **Administrators** (and the Superadmin recovery account). Standard and Read-only users can now open Settings too, but they'll only see **General → Feature Modules** — everything else on this page stays Admin-only. See [Feature Modules](feature-modules.md) for the full picture of what modules are and how they work; this guide covers just how to turn them on and off.

## What you can configure

### Feature Modules

To get there: **Settings → General → Feature Modules** — visible to every role, but only Admins can flip the switches.

This is where you turn whole feature areas of Keep Track on or off — Reconciliation, Planned Projects, AI Extraction, and more. It's what makes the same installation work for a full charity committee or a stripped-down personal budget tracker, without menus for features you'll never use. Full detail on what each module does and what happens to your data is in the dedicated [Feature Modules](feature-modules.md) guide — this section is just the how-to for the toggle itself.

- Each module shows its **name**, a one-line **description**, an **Active**/**Inactive** status, and a toggle switch.
- **Standard and Read Only users** see the same list, with a note to contact an Administrator — the toggle is greyed out and can't be clicked.
- **To turn a module on:** click its toggle. It switches on immediately, with a confirmation message. If the module needs a little extra setup (AI Extraction, Folder Integration, Debt Tracking, or Budget Planning), a short prompt appears straight after — you can act on it right away or click **Skip for now** and come back to it later.
- **To turn a module off:** click its toggle, then confirm. Keep Track is explicit that this only hides the module from navigation — nothing is deleted, and turning it back on brings everything back exactly as it was, instantly.
- Changes reach every other open tab or session within about 30 seconds; the person making the change sees it immediately.

### Signing and export

On the Settings page, a single on/off switch controls the invoice-signing step for the whole organisation:

> When enabled, users will be asked to sign and date invoices before confirming them. Turn this off for personal use cases where signing is not required.

- **On** (the default) — everyone will be asked to sign and date invoices (see [Reviewing and Signing](reviewing-and-signing.md)) before they're confirmed; the signed PDF downloads automatically and is kept alongside the original.
- **Off** — invoices are confirmed straight away after review, with no signing step — the review card's button simply reads **Confirm**.

Changing this switch takes effect immediately for everyone, including anyone partway through reviewing an invoice.

### AI & Extraction

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

If an invoice's fields come back empty after upload, it usually means AI extraction couldn't read that particular document — just fill them in by hand on the review card as normal. If this keeps happening, check this page for a misconfigured or missing API key.

### Notification thresholds

Decide how many days an invoice can sit unreviewed before Keep Track flags it as overdue for everyone with access to notifications.

### Categories

Categories are what invoices get classified against (Electricity, Water, Broadband, and so on). Keep Track comes with seven ready to use — Electricity, Water, Broadband, HVAC, Alarm, Supplies, and General Maintenance — but you can add, rename, recolour, or retire them to fit your own organisation.

To get there: **Settings → Categories** in the sidebar (only Admins see this sub-item).

- **View categories** — the page lists every category with its colour, name, and whether it's Active or Inactive.
- **Add a category** — click **+ Add category**, type a name, pick a colour, and save. The colour is used consistently for that category everywhere it appears (charts, tables, badges).
- **Edit a category** — click **Edit** next to it to rename it or change its colour, then **Save**.
- **Deactivate a category** — click **Deactivate**, then confirm with **Yes, deactivate**. This doesn't delete it — any invoice already using that category keeps it — it just won't be offered as an option for new invoices.
- **Restore a category** — if you've deactivated one by mistake, or need it again, click **Restore** to bring it back to Active.

Category names must be unique — Keep Track will tell you if you try to add or rename one to something already in use.

### User management

To get there: **Settings → Users**. There are two tabs — **Active users** and **Pending approval**.

#### Active users

A table of every approved account, showing their name/username, email, role, when they joined, when they last logged in ("Never" if they haven't yet), and whether they're Active or Inactive.

- **Change a role** — pick a new role directly from the dropdown in the Role column. Changes take effect immediately.
- **Reset a password** — click **Reset password**, confirm, and Keep Track generates a random 8-character temporary password on the spot. Copy it and share it with the user yourself (by whatever secure means you'd normally use) — Keep Track doesn't email it. The user must set their own new password the next time they log in before they can do anything else.
- **Deactivate an account** — click **Deactivate** and confirm. A deactivated user can no longer log in ("Your account has been deactivated. Please contact an Administrator.") but their history (invoices, contributions, etc.) is untouched.
- **Reactivate an account** — click **Reactivate** on an inactive user to restore their access.

You can't change the role of, reset the password of, or deactivate **your own account** or the **Superadmin account** — those actions are hidden for those rows. The Superadmin account can never be deactivated, since it's the recovery login for when every Admin account is locked out or forgotten.

#### Pending approval

Anyone who self-registers shows up here first, with their username, email, and registration date.

- **Approve** — pick their role from the dropdown (Admin, Standard, or Read only) and click **Approve**. They can log in from that point on.
- **Reject** — click **Reject** and confirm to turn away a registration you don't recognise or don't want. This removes the registration entirely; they'd need to register again if that was a mistake.

### Logs

Keep Track automatically manages your logs to keep the app fast and your data clean. Audit logs are archived every 90 days — archived entries are kept permanently and can be exported at any time. Error logs are automatically deleted after 90 days. These settings cannot be changed to ensure data integrity.

To get there: **Settings → Logs** (only Admins and the Superadmin see this sub-item). There are two tabs — **Audit log** and **Error log**.

#### Audit log

A record of who did what and when — logins, uploads, edits, deletions, approvals, settings changes, and more. The status bar at the top shows how many entries are currently active (the last 90 days), how many have been permanently archived, and when the log was last archived.

- **Filter** by user, action type, or a date range.
- **Click a row** to expand it and see full detail — before/after values for an edit, the IP address for a login, or which record was affected.
- Rows are colour-coded down the left edge: green for things being created, blue for edits and updates, amber for settings changes, and red for deletions and security events (failed logins, deactivations, a system reset).
- **Include archive** — tick this to switch the table over to the permanent archive instead of the last 90 days. A banner makes it clear you're looking at archived, read-only history.
- **Archive now** — normally archiving happens automatically every 90 days, but an Admin can trigger it immediately from here if needed.
- **Export CSV** — exports whatever's currently filtered (and switches to exporting the archive too, if that toggle is on).

#### Error log

A rolling record of things that went wrong in the background — a failed AI extraction, a PDF that couldn't be signed, a failed login, or an unexpected error — kept for 90 days and then automatically deleted. The status bar shows the total in the last 90 days, a breakdown by severity, and when the log was last cleaned up.

- **Filter** by severity, source, or a date range.
- **Click a row** to see the full technical detail (stack trace), useful if you need to pass it on for troubleshooting.
- Severity is shown as a coloured badge: blue for Info, amber for Warning, red for Error, and a pulsing dark red for Critical — critical entries are worth checking promptly.
- If any critical errors appear in the last 7 days, Admins and the Superadmin see a banner on the Dashboard linking straight here.
- **Export CSV** — exports whatever's currently filtered.

### Storage & Backup

To get there: **Settings → Storage & Backup** (Admin; restoring is Superadmin only).

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

### Watched folder

Set the network folder path that Keep Track should watch for new invoice files (if your organisation uses this feature).

### Financial year

Set the start and end dates for the financial year (the default is September to August), and enter the opening balance when a new financial year begins.

### Terminology

Keep Track ships with charity-style names for things — "Invoices," "Contributions," "Projects," "Reconciliation," "Target Reserve" — but not everyone using it is a charity. If you're tracking a personal budget or running a small business, you can rename these labels so the app reads naturally for you.

To get there: **Settings → Terminology**.

- **Expenses label** — what to call money going out. Default: *Invoices*. Try *Bills* or *Expenses*.
- **Income label** — what to call money coming in. Default: *Contributions*. Try *Income*, *Revenue*, or *Membership Fees*.
- **Projects label** — what to call planned future spend. Default: *Projects*. Try *Future Expenses* or *Planned Spend*.
- **Reconciliation label** — what to call matching the calculated balance against the bank. Default: *Reconciliation*. Try *Monthly Check* or *Bank Reconciliation*.
- **Reserve label** — what to call the target reserve on the dashboard gauge. Default: *Target Reserve*. Try *Rainy Day Fund* or *Savings Goal*.
- **Site/instance name** — your organisation or personal name, shown in the header next to the Keep Track logo (e.g. "Keep Track — KHOC"). Leave it as "Keep Track" if you don't want anything extra shown.

As you type, a small **live preview** shows how the sidebar will look with your new labels, before you save anything.

- Click **Save all** to apply every field at once. The sidebar, page titles, notifications, and dashboard update immediately for everyone — no page refresh needed.
- Click **Reset to defaults** to put every label back to its original charity-style wording. You'll be asked to confirm first, since this affects everyone.

### Target Reserve

The target reserve (whatever you've renamed it to, above) is the dashboard gauge that shows how your current balance compares to a healthy amount held in reserve.

To get there: **Settings → Target Reserve**.

- **Automatic** (the default) — Keep Track works out your average monthly spend over the last 3 months and multiplies it by a **months multiplier** you choose (1–12, default 3). For example, a multiplier of 3 targets three months' worth of average spend held in reserve.
- **Manual** — set a fixed £ amount yourself instead of letting Keep Track calculate one. Useful if your organisation already has an agreed reserve figure.

Whichever method you choose, the dashboard gauge shows the calculation method underneath it in small text, so everyone can see how the target was arrived at.

### System reset (Danger Zone)

Only the **Superadmin** recovery account can see or use this — not even a regular Administrator can. It permanently erases everything in Keep Track and puts it back exactly as it was the day it was installed.

To get there: **Settings → Danger Zone** (Superadmin only).

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
