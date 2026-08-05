# Storage and Backup

This document covers how Keep Track stores files on disk, how to change where they're kept, how
to configure and run backups, and how to restore a Keep Track installation from one. For the
plain-English walkthrough of the Settings screen itself, see
[user-guides/settings-guide.md](../user-guides/settings-guide.md).

## How file storage works

Every file Keep Track writes — original uploaded PDFs, signed PDFs, and generated report PDFs —
lives under a single configurable root directory, the **storage path** (Settings → Storage &
Backup). Underneath that root, the layout is fixed:

```
{storage_path}/
  invoices/
    original/{year}/{month}/{uuid}_{filename}.pdf
    signed/{year}/{month}/{uuid}_{filename}.pdf
  reports/
    {year}/{month}/{uuid}_{report-title}.pdf
```

- **Original PDFs** are dated by upload date.
- **Signed PDFs** are dated by signing date (which may be later than the invoice's own date).
- **Reports** are dated by generation date.

The database only ever stores the *full path* to a file (`invoice_files.original_path`,
`invoices.signed_pdf_path`, `reports.file_path`) — the storage path itself is read from the
`storage_path` setting at the moment a file is written or served, not baked into application code.
That's what makes changing it later possible without breaking every existing link.

The default storage path is `/data`, which lines up with the Docker volumes already mounted by
`docker-compose.yml` (`invoice_storage:/data/invoices`, `report_storage:/data/reports`) — a fresh
install needs no configuration to have persistent storage.

## Changing the storage path

**Settings → Storage & Backup → Change storage path** (Admin only).

1. Enter the new path. It must be a path the backend container can write to — if you're moving to
   a NAS or a different volume, mount it into the backend container first (see your
   `docker-compose.yml` or Kubernetes manifests) and give its in-container path here, not a path on
   your host machine.
2. Leave **Move existing files to new location** on (the default) unless you have a specific
   reason not to. With it on, Keep Track:
   - Moves every file from the old path to the new one.
   - Updates every database record that pointed at the old path (`invoice_files.original_path`,
     `invoices.signed_pdf_path`, `reports.file_path`) to point at the new one.
   - Rolls back to the original path automatically if the move fails partway through — either the
     files finish moving and the database is updated, or neither happens.
   - Logs the move to the audit log with the file count and total size moved.
3. Turning **Move existing files** off just updates the setting and leaves every file where it
   is — Keep Track will warn you clearly before you can do this, because every existing invoice
   and report link will immediately 404 until you move the files there yourself by hand.

Large moves (many files, or a slow destination like a network share) can take a little while — the
button shows a "Moving files…" state until it's done.

## Manual backups

**Settings → Storage & Backup → Create manual backup** (Admin only).

Click the button. Keep Track builds a zip file containing a full database dump, every file under
the storage path, and a manifest (see below), then immediately offers it as a browser download.
If a backup destination path is configured (see below), a copy is also saved there. Either way,
`last_backup_date` and `last_backup_size` (shown in the status card) are updated, and the backup is
logged to the audit log.

Manual backups are **never automatically deleted** — only scheduled backups are subject to
retention. Keep as many manual backups as you want; delete them yourself from Backup History when
you no longer need them.

## Scheduled backups (e.g. to a NAS)

**Settings → Storage & Backup → Scheduled backups** (Admin only).

1. Mount your NAS share (or wherever you want backups kept) into the backend container, the same
   way you would for storage — a Docker volume, an SMB/NFS mount, or a Kubernetes volume mount.
2. Set **Backup destination path** to that path (required for any schedule other than Manual).
   Keep Track checks the path is writable before saving.
3. Choose a **Schedule**: Daily, Weekly (Sunday), or Monthly (1st of the month) — all at 2am UTC.
4. Set **Keep last N** — how many *scheduled* backups to retain. Once a scheduled backup pushes
   the count over this number, the oldest scheduled backups are deleted automatically. Manual
   backups in the same folder are left alone regardless of this setting.
5. Click **Save schedule**.

A background check runs every few minutes and fires the backup once the scheduled time is due,
using `last_backup_date` (of any backup, manual or scheduled) to avoid running twice in the same
day. Success and failure are both recorded — a completed scheduled backup is written to the audit
log; a failed one is also written to the error log, which Admins can review under Settings → Logs.

## What a backup contains

Each backup is a single `.zip` file, named `keeptrack-backup-{manual|scheduled}-{timestamp}.zip`,
containing:

- **`database_dump.sql`** — a complete `pg_dump` of the PostgreSQL database: every table, every
  user account, every setting, the full audit log — everything.
- **`files/`** — every file under the storage path, in the same `invoices/original/…`,
  `invoices/signed/…`, `reports/…` structure it's stored in live.
- **`backup_manifest.json`** — a summary of the backup:
  - Keep Track version.
  - Backup date and time, and who triggered it (or `null` for a scheduled backup).
  - Record counts for every major table (users, invoices, contributions, categories, and so on).
  - The list of every file included.
  - A snapshot of non-secret configuration values (e.g. `anthropic_model`,
    `default_financial_year_start_month`) — enough to compare configuration between two
    installations, without exposing anything sensitive.
  - **`secrets_to_copy_manually`** — the list of `.env` keys deliberately *excluded* from the
    backup because they're server credentials, not application data: `database_url`, `jwt_secret`,
    `mfa_encryption_key`, `superadmin_password`, and `anthropic_api_key`. A restore never needs
    these to succeed, but the new system's `.env` file needs its own real values for these before
    (or immediately after) Keep Track will work correctly there.
  - A SHA-256 checksum of the database dump, used to detect a corrupted or tampered zip before any
    restore is attempted.
  - Plain-English restore instructions.

## Restoring from a backup on a new system

**Settings → Storage & Backup → Restore from backup** (Superadmin only).

Restoring is for standing up a *new* installation from an existing backup — moving to new
hardware, recovering from a lost server, or cloning an installation for testing. It replaces
**all** current data on the target system, so it's gated to the Superadmin account and requires
the Superadmin's password to confirm.

1. **Prepare the new system first.** Install Keep Track (`docker-compose up`, migrations run), set
   up its `.env` file — in particular `SUPERADMIN_USERNAME` / `SUPERADMIN_EMAIL` /
   `SUPERADMIN_PASSWORD` and the values listed in the backup's `secrets_to_copy_manually` (a fresh
   `JWT_SECRET` and `MFA_ENCRYPTION_KEY` are fine to generate new — they don't need to match the
   old system).
2. Log in as the Superadmin on the new (empty) system.
3. Go to **Settings → Storage & Backup → Restore from backup**, choose the backup `.zip` file.
   Keep Track reads the manifest and shows a preview: backup date, record counts, files included,
   and a Superadmin consistency warning if applicable (see below) — nothing is restored yet at
   this point.
4. Enter the Superadmin password and click **Confirm restore**.

What happens, in order:

1. Keep Track stops accepting other requests for the duration of the restore (a brief maintenance
   window — typically well under a minute).
2. The zip's checksum is re-verified.
3. The database is restored from `database_dump.sql`, inside a single transaction — if anything in
   the restore fails, the whole thing rolls back and the database is left exactly as it was before
   you started.
4. Every file is restored to the (now-restored) storage path, replacing whatever was there. If the
   file restore fails partway through, whatever was there before is put back.
5. The Superadmin consistency check runs (see below).
6. Every existing login session is invalidated, so everyone — including you — has to log in again.
7. Keep Track resumes accepting requests, and the restore is logged to the audit log.

## The Superadmin consistency check

The Superadmin account is bootstrapped from `.env` (`SUPERADMIN_USERNAME`, etc.) independently of
whatever's in the database — it's a recovery account, not a normal user (see
[user-roles.md](user-roles.md)). A restored backup carries whatever Superadmin username the
*source* system had, which may not match the `.env` file on the system you're restoring onto.

If they don't match, Keep Track shows a warning (in both the pre-restore preview and the
post-restore result):

> The restored database has a different Superadmin account than this installation. You may need
> to update your `.env` file.

This isn't an error — the restore still completes — but if you see it, update
`SUPERADMIN_USERNAME` (and `_EMAIL`/`_PASSWORD`) in the new system's `.env` file to match whichever
account you intend to use as the recovery login, and restart the backend.

## Recommended backup strategy for self-hosted deployments

- **Configure a scheduled backup to a destination outside the machine running Keep Track** — a NAS
  share, a different host's mounted volume, or equivalent. A backup that lives on the same disk as
  the data it protects doesn't survive that disk failing.
- **Daily or weekly is enough for most deployments** — Keep Track is written to by a small number
  of people at a time, not a high-write system, so a large window since the last backup rarely
  means losing more than a handful of invoices' worth of manual re-entry.
- **Take a manual backup before anything risky** — before a storage path change, before a system
  reset, before a major upgrade. Manual backups are never auto-deleted, so this one won't get swept
  away by retention while you might still need it.
- **Keep at least one backup somewhere entirely separate from your Keep Track deployment** — a
  laptop, a second NAS, cloud storage — in case the destination you scheduled backups to is itself
  unavailable when you need to restore.
- **Treat backup files as sensitive** — a backup contains every user's data, including account
  details and the full audit trail. Store it somewhere access-controlled, the same way you would
  the live database.
- **Periodically test a restore**, ideally onto a throwaway test instance rather than production —
  a backup you've never successfully restored from is an assumption, not a guarantee.
