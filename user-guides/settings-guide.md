# Settings Guide

Settings control how Keep Track behaves for everyone. Most settings are only available to Administrators.

## Who can access Settings

Only **Administrators** (and the Superadmin recovery account) can view and change settings. If you're a Standard or Read-only user, you won't see this option.

## What you can configure

### Signing and export

On the Settings page, a single on/off switch controls the invoice-signing step for the whole organisation:

> When enabled, users will be asked to sign and date invoices before confirming them. Turn this off for personal use cases where signing is not required.

- **On** (the default) — everyone will be asked to sign and date invoices (see [Reviewing and Signing](reviewing-and-signing.md)) before they're confirmed; the signed PDF downloads automatically and is kept alongside the original.
- **Off** — invoices are confirmed straight away after review, with no signing step — the review card's button simply reads **Confirm**.

Changing this switch takes effect immediately for everyone, including anyone partway through reviewing an invoice.

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

- See a list of people waiting to be approved.
- Approve a new user and choose their role (Admin, Standard, or Read only).
- Change an existing user's role, or deactivate an account that's no longer needed.

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
