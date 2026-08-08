# Folder Integration

Folder Integration automatically picks up new invoices from a shared folder, and can automatically save signed PDFs back out to one — so invoices arriving by email-to-folder, a scanner's network share, or a supplier's automated export never need a manual upload, and signed copies land wherever your organisation keeps its records without anyone having to remember to download them.

This is a [feature module](feature-modules.md), switched **off** by default. An Administrator turns it on from **Settings → General → Feature Modules**, then configures it from **Settings → Data → Folder Integration**.

## What it does

- **Input folder** — Keep Track checks a folder you choose on a regular interval. Any PDF sitting directly in it is picked up automatically, read by AI extraction exactly like a manual upload, and either added straight to your records (if it's an older, historical invoice) or dropped into the review queue for someone to check.
- **Output folder** — once an invoice is signed, Keep Track can automatically save a copy of the signed PDF to a second folder, neatly organised by financial year and month, alongside (or instead of) the usual browser download.

Both halves are independent — you can use just the input folder, just the output folder, or both together.

## Setting up a local input folder

"Local" means a folder mounted directly into the Keep Track backend container as a Docker volume — the simplest option if the folder already lives on the same machine or network Keep Track runs on.

1. In `docker-compose.yml`, the `backend` service already has a `watched_folder` volume mounted at `/data/watched` — the easiest starting point. Point it at a real folder on your host by changing that line to a bind mount, e.g.:
   ```yaml
   volumes:
     - /path/on/your/server/invoices-in:/data/watched
   ```
   Then restart the stack (`docker compose up -d`) for the new mount to take effect.
2. In Keep Track, go to **Settings → Data → Folder Integration**.
3. Under **Input folder**, choose **Local path** and enter `/data/watched` (or wherever you mounted it).
4. Click **Test connection** — you should see a green tick and a count of PDF files currently sitting there.
5. Choose a **poll interval** (how often Keep Track checks the folder — 30 seconds, 1 minute, 5 minutes, or 30 minutes; 1 minute is the default and suits most setups).
6. Switch on **Watch for new invoices**, then **Save**.

## Setting up an SMB input folder

"SMB" means Keep Track connects directly over the network to a Windows-style file share — a NAS, a Windows server, or similar — without needing anything mounted at the OS level.

1. Go to **Settings → Data → Folder Integration**.
2. Under **Input folder**, choose **SMB Network Share**.
3. Enter the **Server** (an IP address or hostname, e.g. `192.168.1.100`) and the **Share name** (e.g. `invoices`).
4. If the share allows anyone to connect without a login, switch on **This share allows guest access**. Otherwise, leave it off and enter a **Username** and **Password** — Keep Track encrypts the password before storing it and never displays it again.
5. If your invoices live in a subfolder of the share rather than its root, enter it under **Full path within share** (e.g. `/incoming`). A preview underneath shows the full address Keep Track will connect to, e.g. `smb://192.168.1.100/invoices/incoming`.
6. Click **Test connection** to confirm Keep Track can reach the share and count what's there.
7. Choose a poll interval, switch on **Watch for new invoices**, and **Save**.

## A note on NFS

Keep Track doesn't speak NFS directly the way it speaks SMB. Instead, mount the NFS share at the operating system level and point Keep Track at the resulting local folder using the **Local path** option above — Keep Track then treats it exactly like any other local folder.

On Proxmox, mount the NFS share on the host itself and pass the resulting path through as a Docker volume to the `backend` service in `docker-compose.yml`. Your NAS's own documentation will cover the exact NFS mount command or configuration for your device.

## Setting up the output folder

Output folder setup mirrors the input folder — the same **Local path** / **SMB Network Share** choice, the same fields, and its own **Test connection** button. A couple of extra things to decide:

- **Output behaviour** — choose what happens when an invoice is signed:
  - **Browser download only** — the current default behaviour; nothing is saved to a folder.
  - **Save to folder only** — no browser download, just the folder copy.
  - **Both** — download to your browser *and* save to the folder (the default once you enable the output folder).
- Once enabled, signing an invoice (or re-signing one) automatically saves a copy to the output folder in the background — you don't need to do anything extra.
- If you have an already-signed invoice from before the output folder was configured, open that invoice's detail page and click **Export to output folder** to send a copy across manually.
- If a save fails (the share is unreachable, for example), Keep Track shows a notification with the error and you can retry the same way, from the invoice's own detail page, once the problem is fixed.

## Understanding the `processed/` subfolder

Once Keep Track has successfully imported a file from the input folder, it moves the original PDF into a `processed/` subfolder inside the same input folder — it never deletes it. This keeps the original document available if you ever need to double-check what was actually on the invoice, or troubleshoot something that went wrong during extraction.

Keep Track moves processed files to a `processed/` subfolder automatically. This folder will grow over time and should be reviewed periodically. We recommend archiving or deleting files older than 3 months. Automated housekeeping is planned for a future version.

## How duplicate detection works

Keep Track keeps a record of every filename it has successfully imported from the input folder. If a file with the **same name** turns up again, it's flagged as a likely duplicate rather than imported a second time:

- The file is **not** moved to `processed/` and is **not** added as a new invoice.
- Every Administrator gets a notification: *"File [filename] has already been processed. View the existing invoice or process it anyway."*
- From that notification, click **View existing invoice** to jump straight to the invoice Keep Track already created from that file, or **Process anyway** to import it again regardless — useful if two genuinely different invoices happen to share a filename.

This check is based on the filename only, not the file's content — Keep Track's existing possible-duplicate flag (matching on supplier, amount, and date, shown on the review card) still runs independently on every invoice, whether it arrived by upload or by folder, and catches the case of two *different* files that look like the same invoice.

## How historical invoices are handled

Keep Track compares each invoice's date against your **app start date** (set in Settings during initial setup, or from Settings → General):

- **Before your app start date** — treated as historical. It's added straight to your records, marked reviewed, and skips the review queue entirely (the same as a bulk historical import).
- **On or after your app start date** — treated as a normal new invoice. It's added to the review queue (`Invoices → Unreviewed`) exactly like a manual upload, with a notification for anyone with upload permission.

If you haven't set an app start date yet, every folder-imported invoice is treated as new and sent to the review queue.

## Output folder organisation

Signed PDFs are saved into a predictable structure, organised by financial year and month:

```
/FY2025-26/August/CoronaEnergy_2026-08-01_invoice.pdf
```

That's `/FY{start year}-{end year}/{full month name}/{supplier}_{invoice date}_{original filename}.pdf` — the same structure regardless of whether the output folder is local or SMB.

## The Folder Status panel

Below the configuration on the Folder Integration settings page, a live status panel shows:

- **Input** — whether it's enabled and configured, when it last checked the folder, when it will next check, and how many files it's processed today.
- **Output** — whether it's enabled and configured, and how many files it's written today.
- **Recent activity** — the last 10 files Keep Track has seen, with a status badge (Detected, Completed, Failed, Duplicate flagged, and so on) and a timestamp. Click **View full log** for the complete, searchable history.

## Troubleshooting common connection issues

- **"Local path does not exist or is not a directory"** — the path you entered isn't mounted into the container. Check the volume mapping in `docker-compose.yml` and that you've restarted the stack after changing it.
- **"Local path is not readable/writable"** — check the folder's permissions on the host; the container needs to be able to read and write it.
- **"Could not connect to SMB server"** — double-check the server address and that the share is reachable from wherever Keep Track's backend container runs (not just your own computer) — firewalls between the two are a common cause.
- **"SMB path does not exist"** — the share name or the path within the share is wrong. Leave "Full path within share" blank to connect to the root of the share and confirm that works first.
- **Guest access fails** — some SMB servers don't accept true guest/anonymous logins even when configured to allow them; try a dedicated read/write user account instead.
- **Files aren't being picked up** — confirm the toggle is switched on and saved, that files are PDFs sitting directly in the folder (not inside `processed/` or another subfolder), and check the poll interval — a 30-minute interval means a genuine wait before a new file appears.
- Whenever something goes wrong processing a specific file, check **Settings → Notifications & Logs → Logs** — background failures are always recorded there with the underlying error message, alongside the file's own entry in the folder watcher log.

## Related guides

- [Uploading Invoices](uploading-invoices.md) — how a folder-imported invoice compares to a manual upload.
- [Reviewing and Signing](reviewing-and-signing.md) — what happens once a folder-imported invoice is signed and exported.
- [Feature Modules](feature-modules.md) — how enabling and disabling modules works generally.
- [Settings Guide](settings-guide.md) — where Folder Integration is configured.
