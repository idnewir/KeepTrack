# Workflows

Step-by-step documentation of Keep Track's key workflows.

---

## 1. New invoice via upload

1. User goes to the **Invoices** page and clicks **Upload**, or drags a PDF onto the drop zone.
2. Backend saves the original PDF and sends it to the Anthropic API for extraction.
3. Extraction returns date, supplier, amount, suggested category, and notes.
4. Backend checks for likely duplicates (matching supplier + amount + close date) and flags if found.
5. The **review card** opens: PDF preview alongside the editable extracted fields, with a duplicate warning shown if flagged.
6. User corrects any fields as needed.
7. If signing is enabled (see workflow 3), user proceeds to sign; otherwise, user clicks **Confirm**.
8. Invoice is written to the database, associated with the current financial year, and marked `reviewed = true`.
9. Dashboard and ledger update immediately to reflect the new expense.

---

## 2. New invoice via watched folder

1. A PDF is placed into the configured SMB/NFS watched folder (e.g. by scanning a paper invoice or saving an email attachment there).
2. The `watched-folder-watcher` service detects the new file via inotify.
3. The watcher notifies the backend, which pulls the file and runs the same extraction pipeline as a manual upload (steps 2–4 above).
4. The invoice appears in the **review queue** — it does not get auto-confirmed. A Standard user or Admin must review it.
5. From here, the workflow continues as in "New invoice via upload," steps 5–9.

---

## 3. Review, sign and export workflow

*(Only when the signing/export toggle is enabled in Settings.)*

1. From the review card, after confirming the extracted data is correct, the user clicks **Sign**.
2. The PDF preview switches to signing mode: the user drags a signature onto the document.
3. The user resizes and repositions the signature as needed.
4. The current date is applied automatically alongside the signature.
5. User clicks **Apply Signature**.
6. The signed PDF is generated (original left untouched) and saved to local storage; `signed = true` and `signed_pdf_path` recorded on the invoice.
7. User can **export** (download) the signed PDF to their device immediately, or do so later from the invoice's detail view.
8. Invoice is confirmed and written to the database as in the upload workflow.

---

## 4. Monthly contribution recording

1. User (Standard or Admin) goes to **Contributions**.
2. Selects the month and financial year (defaults to the current month/year).
3. For each contributing group, enters the amount received.
4. Saves the entry — recorded against `financial_year_id`, `month`, `group_name`, with `recorded_by` and `recorded_at` set automatically.
5. Dashboard's income figures and the ledger update immediately.

---

## 5. Monthly reconciliation

1. User (Standard or Admin) goes to **Reconciliation** at month end.
2. Keep Track shows the **calculated balance** for the month: opening balance + contributions to date − invoices to date.
3. User enters the **actual balance** from the bank statement.
4. App computes the **discrepancy** (actual − calculated).
5. If a discrepancy exists, the app suggests likely reasons (missing invoice, unrecorded contribution, bank charge, etc.) based on patterns in the data.
6. User reviews the suggestion, optionally adds their own notes, and saves.
7. Reconciliation is recorded (`reconciled_by`, `reconciled_at`); the resulting closing balance carries forward as next month's opening balance.

---

## 6. Running a report

1. Any user (including Read only) goes to **Reports**.
2. Selects a date range and, optionally, one or more categories to filter by.
3. Chooses the report type: **historical analysis** or **forecast**.
4. Backend gathers the relevant invoices, contributions, and balance data for the selected scope.
5. This data is sent to the Anthropic API with a prompt tailored to the report type, producing a written narrative summary.
6. The app assembles the summary, charts, and tables into a report matching the KHOC PDF template style.
7. User previews the report and clicks **Export PDF** to download it.

---

## 7. Onboarding a new user

1. A new user visits the Keep Track login page and clicks **Register**.
2. They enter a username, email, and password, and set up MFA by scanning a QR code in their authenticator app.
3. Their account is created with `approved = false` — they cannot log in yet.
4. An existing Admin sees a pending-approval notification and opens **Settings → User Management**.
5. Admin reviews the request and either approves it (assigning a role: Admin, Standard, or Read only) or rejects it.
6. On approval, the user's account is activated; they can now log in with username + password + TOTP code.

*(Exception: the very first user to access a freshly installed Keep Track instance is walked through a setup wizard instead of this flow, and becomes the first Admin automatically — see [decisions-log.md](decisions-log.md).)*
