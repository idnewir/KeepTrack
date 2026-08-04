# User Roles

Keep Track has four roles. Every user account has exactly one role, assigned by an Admin (or, for the Superadmin account, configured at setup).

---

## Superadmin

A backdoor account intended purely for lockout recovery (e.g. if every Admin account is locked out or forgotten). Not intended for day-to-day use.

**Can:**
- Everything an Admin can do.
- Recover access if no Admin account is usable (reset another user's role or password).

**Cannot:**
- N/A — this is the highest-privilege role, but it exists for recovery, not routine administration.

**Notes:** Has its own MFA. Should be used rarely and its credentials stored securely.

---

## Admin

Full operational control of the system.

**Can:**
- Add, edit, and delete any data (invoices, categories, contributions, reconciliations, planned projects).
- Manage users: approve pending registrations, assign/change roles, deactivate accounts.
- Change system settings (signing toggle, notification thresholds, watched folder path, financial year configuration).
- Everything a Standard user and Read only user can do.

**Cannot:**
- Access the Superadmin recovery function (that is reserved for the Superadmin account itself).

---

## Standard user

The day-to-day operational role for someone processing invoices.

**Can:**
- Upload invoices (manual and via watched folder).
- Review and correct AI-extracted invoice data.
- Approve/confirm invoices into the system.
- Sign invoices (when the signing workflow is enabled) and export signed PDFs.
- Record monthly contributions.
- Run and export reports.
- View the dashboard and browse all data.

**Cannot:**
- Change system settings.
- Manage users (approve registrations, assign roles).
- Manage categories.

---

## Read only

A view-only role for stakeholders who need visibility without the ability to change anything.

**Can:**
- View the dashboard and all its drill-down detail.
- Browse invoices, contributions, reconciliations, and planned projects.
- Run and export reports.

**Cannot:**
- Upload, edit, sign, or delete anything.
- Record contributions or reconciliations.
- Change settings or manage users.

---

## Summary Table

| Capability                              | Superadmin | Admin | Standard | Read only |
|------------------------------------------|:----------:|:-----:|:--------:|:---------:|
| View dashboard & browse data              | ✅ | ✅ | ✅ | ✅ |
| Run & export reports                      | ✅ | ✅ | ✅ | ✅ |
| Upload / review / confirm invoices        | ✅ | ✅ | ✅ | ❌ |
| Sign & export invoice PDFs                | ✅ | ✅ | ✅ | ❌ |
| Record contributions                      | ✅ | ✅ | ✅ | ❌ |
| Perform monthly reconciliation            | ✅ | ✅ | ✅ | ❌ |
| Log planned projects                      | ✅ | ✅ | ✅ | ❌ |
| Manage categories                         | ✅ | ✅ | ❌ | ❌ |
| Manage users (approve / assign roles)     | ✅ | ✅ | ❌ | ❌ |
| Change system settings                    | ✅ | ✅ | ❌ | ❌ |
| Lockout recovery                          | ✅ | ❌ | ❌ | ❌ |

---

## Onboarding note

The **first user** to access Keep Track after installation goes through a **setup wizard** and automatically becomes the first **Admin** — there is no pending state for this first account. Every user who registers after that is held as **pending** until an existing Admin reviews and approves them, assigning a role at that time.
