# Uploading Invoices

This guide explains how to add a new invoice to Keep Track.

## Two ways to add an invoice

### Option A: Upload it yourself

1. Go to the **Invoices** page using the sidebar, or use the **Upload invoice** quick action on the Dashboard.
2. Click **+ Upload invoice**. You'll land on the Upload page, where you can either:
   - **Drag and drop** one or more PDF files onto the box, or
   - Click **Browse files** and pick them from your computer.
3. You can select several invoices at once — each one gets its own progress indicator while it uploads.
4. Once a file finishes uploading, Keep Track reads it automatically and takes you straight to the review step below.

Only Standard users and Administrators can upload invoices. Read Only accounts can browse and search invoices but won't see the upload button.

### Option B: Drop it in the watched folder

If your organisation has a shared network folder set up for this, invoices saved there will be picked up automatically and enter the same review queue as a manual upload. Ask your administrator whether this has been configured for your organisation.

## Checking what Keep Track found

Keep Track uses AI to read the invoice and fill in the details for you:

- Date
- Supplier (who the invoice is from)
- Amount
- Category (e.g. Electricity, Water, Supplies)
- Notes

The amount Keep Track extracts is always the **total inclusive of VAT** — the actual amount that was paid or is due — not the amount before VAT.

**Always check these details carefully.** The AI does a good job most of the time, but it can make mistakes — especially with handwritten, scanned, or unusual invoices.

1. You'll see the invoice PDF on one side of the screen and the details it found on the other.
2. Click into any field to correct it if needed.
3. **Any field shown with an amber border and a "Please fill this in" note is one the AI couldn't read** — usually because the invoice was hard to scan or didn't contain that information clearly. Fill these in yourself before confirming.
4. If Keep Track thinks this might be a duplicate of an invoice you've already added — same supplier, a similar amount, and a nearby date — it shows a red warning banner at the top of the card. Check your existing invoices before continuing if you see this.

## Confirming or discarding

- Once everything looks correct, click **Confirm**. If your organisation uses the signing feature, you'll be asked to sign the invoice first — see [Reviewing and Signing](reviewing-and-signing.md). Once confirmed, the invoice is saved and will immediately show up in your dashboard totals and the Invoices list.
- If you uploaded the wrong file, or the invoice shouldn't be added at all, click **Discard** and confirm — this removes it without saving anything.

## Tips

- You can upload invoices in any order — Keep Track sorts everything by date automatically.
- Newly uploaded invoices are marked **Unreviewed** (shown with an amber badge on the Invoices list) until you confirm them — so it's easy to spot anything still waiting for a check.
- If you make a mistake after confirming, open the invoice from the Invoices list and correct it there.

## Bringing in historical data (bulk import)

If you're getting started with Keep Track and already have years of past invoices in a spreadsheet or a folder of PDFs, the **Import** page (sidebar, between Invoices and Contributions) lets you bring them all in at once — without going through the review, sign, and export workflow for every single one. Invoices added this way are marked **Historical**: they're recorded as already reviewed and don't need signing, but they show a subtle **Historical** badge on the Invoices list so they stay visually distinct from your day-to-day uploads.

Only Standard users and Administrators can access the Import page.

### CSV import

Use this if your historical records are already in a spreadsheet (Keep Track was built with KHOC's own `KHOC_Master_Invoices.csv` in mind, but any similar layout works).

1. Go to **Import → CSV import**.
2. If you need a starting point, click **Download CSV template** for a blank spreadsheet with the right columns and a few example rows.
3. Drag your CSV onto the drop zone, or click **Browse files**.
4. Keep Track shows a preview of the first few rows and its best guess at which column is which (Date, Supplier, Amount, Category, Notes, and so on). If your spreadsheet uses different column headers, adjust the dropdowns until each one points at the right column — Date, Supplier, and Amount must all be mapped before you can continue.
5. Click **Import invoices**. Once it finishes, you'll see a summary:
   - How many invoices were imported successfully.
   - How many rows were skipped, and why (a row with no amount, a zero amount, or notes mentioning "remittance advice" isn't treated as an invoice and is skipped automatically).
   - How many were flagged as possible duplicates, for you to double-check.
   - A **View imported invoices** link straight to this batch on the Invoices list.

A few things Keep Track does automatically while importing a CSV:
- Dates are read flexibly — `DD/MM/YYYY`, `YYYY-MM-DD`, and `MM/YYYY` (assumed to be the 1st of the month) are all understood.
- Each row's category is matched against your active categories by name (a close partial match is fine). If nothing matches, the invoice is still imported but assigned to **General Maintenance**, with a note added so you can easily find and recategorise it later.

### PDF import

Use this if your historical records are a folder of PDF invoices rather than a spreadsheet.

1. Go to **Import → PDF import**.
2. Drag and drop as many PDFs as you like onto the drop zone, or **Browse files**.
3. Click **Process** — Keep Track runs the same AI extraction it uses for a normal upload against each one. If AI can't read a particular file, that invoice is still created with empty fields for you to fill in by hand.
4. Review cards appear for each processed PDF, just like a normal upload — check and correct the details as needed. Each card shows a green **"Historical import — signing not required"** banner, and skips the signing step entirely, regardless of your organisation's signing setting.
5. Confirm invoices one at a time, or use **Confirm all reviewed** to confirm everything in the queue in one go.

### Managing past imports

Below the import tabs, **Import history** lists every CSV and PDF import that's been run, with its date, type, file (or file count), how many invoices were imported, and its status. From here you can:

- **View invoices** — jump to the Invoices list filtered to just that batch.
- **Delete** *(Administrators only)* — removes the whole batch in one go. Keep Track shows you exactly how many invoices will be deleted before asking you to confirm. Any invoice from that batch you've since gone in and corrected is automatically protected and left alone, so a bulk delete can't undo work you've already checked.
