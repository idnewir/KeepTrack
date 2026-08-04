# Database Schema

PostgreSQL schema for Keep Track. All tables use a surrogate integer primary key (`id`, `SERIAL`/`BIGSERIAL`) unless noted. Foreign keys use `ON DELETE RESTRICT` by default to protect financial history, except where noted.

## Entity Overview

```
users ──< invoices (created_by)
users ──< contributions (recorded_by)
users ──< monthly_reconciliations (reconciled_by)
users ──< planned_projects (created_by)
users ──< notifications (user_id)

financial_years ──< invoices
financial_years ──< contributions
financial_years ──< monthly_reconciliations
financial_years ──< planned_projects

categories ──< invoices (category_id)
```

---

## `users`

| Column        | Type            | Constraints                              | Notes                                   |
|---------------|-----------------|-------------------------------------------|------------------------------------------|
| id            | SERIAL          | PRIMARY KEY                               |                                          |
| username      | VARCHAR(100)    | UNIQUE, NOT NULL                          |                                          |
| email         | VARCHAR(255)    | UNIQUE, NOT NULL                          |                                          |
| password_hash | VARCHAR(255)    | NOT NULL                                  | bcrypt/argon2 hash, never plaintext     |
| role          | VARCHAR(20)     | NOT NULL, CHECK IN ('superadmin','admin','standard','readonly') |            |
| mfa_secret    | VARCHAR(64)     | NOT NULL                                  | TOTP secret, encrypted at rest          |
| approved      | BOOLEAN         | NOT NULL DEFAULT FALSE                    | FALSE until an Admin approves           |
| created_at    | TIMESTAMPTZ     | NOT NULL DEFAULT now()                    |                                          |

---

## `categories`

| Column | Type         | Constraints                | Notes                                   |
|--------|--------------|------------------------------|------------------------------------------|
| id     | SERIAL       | PRIMARY KEY                 |                                          |
| name   | VARCHAR(100) | UNIQUE, NOT NULL            |                                          |
| colour | VARCHAR(7)   | NOT NULL                    | Hex colour, e.g. `#2D6B9F`               |
| active | BOOLEAN      | NOT NULL DEFAULT TRUE       | Deactivated, not deleted — preserves history |

Seeded defaults: Electricity, Water, Broadband, HVAC, Alarm, Supplies, General Maintenance.

---

## `financial_years`

| Column     | Type         | Constraints              | Notes                        |
|------------|--------------|----------------------------|--------------------------------|
| id         | SERIAL       | PRIMARY KEY                |                                |
| label      | VARCHAR(20)  | UNIQUE, NOT NULL           | e.g. `"2025/26"`               |
| start_date | DATE         | NOT NULL                   | Default 1 September            |
| end_date   | DATE         | NOT NULL                   | Default 31 August              |

---

## `invoices`

| Column           | Type          | Constraints                                             | Notes                                       |
|------------------|---------------|-----------------------------------------------------------|-----------------------------------------------|
| id               | SERIAL        | PRIMARY KEY                                                |                                                |
| filename         | VARCHAR(255)  | NOT NULL                                                   | Original uploaded filename                    |
| upload_date      | TIMESTAMPTZ   | NOT NULL DEFAULT now()                                     |                                                |
| invoice_date     | DATE          | NOT NULL                                                   | Date on the invoice itself (extracted/edited) |
| supplier         | VARCHAR(255)  | NOT NULL                                                   |                                                |
| amount           | NUMERIC(12,2) | NOT NULL                                                   |                                                |
| category_id      | INTEGER       | REFERENCES categories(id)                                  |                                                |
| notes            | TEXT          |                                                             |                                                |
| signed           | BOOLEAN       | NOT NULL DEFAULT FALSE                                     |                                                |
| signed_pdf_path  | VARCHAR(500)  |                                                             | Filesystem path to the signed PDF, if any     |
| financial_year_id| INTEGER       | REFERENCES financial_years(id), NOT NULL                   |                                                |
| reviewed         | BOOLEAN       | NOT NULL DEFAULT FALSE                                     | TRUE once a user has confirmed the review card |
| duplicate_flag   | BOOLEAN       | NOT NULL DEFAULT FALSE                                     | Set by AI duplicate detection                 |
| created_by       | INTEGER       | REFERENCES users(id), NOT NULL                              |                                                |

---

## `contributions`

| Column           | Type          | Constraints                             | Notes                          |
|------------------|---------------|--------------------------------------------|----------------------------------|
| id               | SERIAL        | PRIMARY KEY                                |                                  |
| financial_year_id| INTEGER       | REFERENCES financial_years(id), NOT NULL   |                                  |
| month            | SMALLINT      | NOT NULL, CHECK (month BETWEEN 1 AND 12)   | Calendar month number            |
| group_name       | VARCHAR(100)  | NOT NULL                                   | Contributing group's name        |
| amount           | NUMERIC(12,2) | NOT NULL                                   |                                  |
| recorded_by      | INTEGER       | REFERENCES users(id), NOT NULL              |                                  |
| recorded_at      | TIMESTAMPTZ   | NOT NULL DEFAULT now()                     |                                  |

---

## `monthly_reconciliations`

| Column             | Type          | Constraints                              | Notes                                    |
|--------------------|---------------|---------------------------------------------|---------------------------------------------|
| id                 | SERIAL        | PRIMARY KEY                                 |                                              |
| financial_year_id  | INTEGER       | REFERENCES financial_years(id), NOT NULL    |                                              |
| month              | SMALLINT      | NOT NULL, CHECK (month BETWEEN 1 AND 12)    |                                              |
| calculated_balance | NUMERIC(12,2) | NOT NULL                                    | Opening + contributions − invoices          |
| actual_balance     | NUMERIC(12,2) | NOT NULL                                    | Entered from the bank statement             |
| discrepancy        | NUMERIC(12,2) | NOT NULL                                    | actual − calculated                         |
| notes              | TEXT          |                                              | Suggested/confirmed reason for discrepancy  |
| reconciled_by      | INTEGER       | REFERENCES users(id), NOT NULL               |                                              |
| reconciled_at      | TIMESTAMPTZ   | NOT NULL DEFAULT now()                      |                                              |

`UNIQUE (financial_year_id, month)` — one reconciliation per month per financial year.

---

## `planned_projects`

| Column           | Type          | Constraints                             | Notes                             |
|------------------|---------------|--------------------------------------------|--------------------------------------|
| id               | SERIAL        | PRIMARY KEY                                |                                       |
| name             | VARCHAR(255)  | NOT NULL                                   |                                       |
| description      | TEXT          |                                             |                                       |
| estimated_cost   | NUMERIC(12,2) | NOT NULL                                   |                                       |
| expected_month   | SMALLINT      | NOT NULL, CHECK (expected_month BETWEEN 1 AND 12) |                                |
| financial_year_id| INTEGER       | REFERENCES financial_years(id), NOT NULL    |                                       |
| created_by       | INTEGER       | REFERENCES users(id), NOT NULL              |                                       |
| created_at       | TIMESTAMPTZ   | NOT NULL DEFAULT now()                     |                                       |

---

## `notifications`

| Column     | Type         | Constraints                          | Notes                                                       |
|------------|--------------|-----------------------------------------|----------------------------------------------------------------|
| id         | SERIAL       | PRIMARY KEY                             |                                                                  |
| user_id    | INTEGER      | REFERENCES users(id), NOT NULL          |                                                                  |
| type       | VARCHAR(50)  | NOT NULL                                | e.g. `balance_below_target`, `reconciliation_overdue`, `invoice_unconfirmed`, `duplicate_flagged`, `expected_invoice_missing` |
| message    | TEXT         | NOT NULL                                | Human-readable notification text                               |
| read       | BOOLEAN      | NOT NULL DEFAULT FALSE                  |                                                                  |
| created_at | TIMESTAMPTZ  | NOT NULL DEFAULT now()                  |                                                                  |

---

## Indexes (recommended)

- `invoices(financial_year_id)`, `invoices(category_id)`, `invoices(invoice_date)`
- `contributions(financial_year_id, month)`
- `notifications(user_id, read)`
- `users(username)`, `users(email)` — already covered by UNIQUE constraints
