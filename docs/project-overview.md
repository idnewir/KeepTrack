# Project Overview

## What is Keep Track?

Keep Track is a self-hosted web application for managing invoices, tracking income and expenses, and producing clear financial reports. A user uploads a PDF invoice (or drops it into a watched folder), and Keep Track uses the Anthropic API to read the document and extract the date, supplier, amount, category, and notes automatically. The user reviews and confirms the extracted data, optionally signs the PDF, and the invoice is recorded against the current financial year.

From there, Keep Track gives a live dashboard showing money in (contributions), money out (invoices), and a forecast of where the balance is heading — including any planned projects. It supports monthly reconciliation against the actual bank balance, and can generate AI-written financial summaries and export them as polished PDF reports.

## Why it was built

Keep Track was built to replace a manual, spreadsheet-and-email process for tracking invoices and contributions for a small charity. That process was slow, error-prone, and gave no real-time visibility into the current financial position. Extracting invoice data by hand was tedious, categorisation was inconsistent, and producing a report for trustees meant hours of manual collation.

Keep Track automates the tedious parts (reading invoices, categorising spend, calculating balances) while keeping a human in the loop for anything that matters (reviewing extracted data, approving new users, signing off reports).

## Who it is for

Keep Track is designed to be generic, not tied to any single organisation. It is intended for:

- **Charity or community site managers** — tracking site running costs (utilities, maintenance, supplies) against contributions from supporting groups.
- **Personal budget trackers** — an individual who wants a clear, automated record of household bills and spending against a personal or family budget.
- **Any small organisation** managing recurring invoices, multiple contributors, and a need for periodic reporting — clubs, small businesses, community groups, or shared households.

The core concepts (categories, financial year, contributions, invoices, reconciliation, reports) are deliberately generic so the app is not locked to any one use case.

## The KHOC context

Keep Track's first real deployment is for **KHOC**, a charity site whose running costs (electricity, water, broadband, HVAC, alarm monitoring, supplies, and general maintenance) are funded by contributions from several supporting groups. KHOC's financial year runs September to August, and its committee needs:

- A simple way to log invoices as they arrive, without manual data entry.
- Visibility of the current balance versus a healthy reserve target.
- Monthly reconciliation against the bank statement.
- Clear, presentable reports for trustees and contributing groups.

KHOC's requirements shaped the initial feature set (financial year, contribution groups, target reserve, signed invoice PDFs for audit purposes), but every KHOC-specific detail — category names, the financial year dates, contribution groups — is configurable rather than hardcoded, so the same app serves any other organisation or individual out of the box.
