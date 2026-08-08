# Reports Guide

Reports let you produce a clear, professional PDF summary of the finances — perfect for sharing with a committee, trustees, or just for your own records. Everyone can generate and download reports, no matter their role.

This guide uses Keep Track's default labels (Invoices, Contributions) — an Administrator can rename these from **Settings → Appearance**; see the [Settings Guide](settings-guide.md).

## Step 1: Go to Reports

Click **Reports** in the sidebar. You'll see two sections: **Generate new report** at the top, and **Previous reports** below it.

## Step 2: Choose what to include

- **Title** — optional. Leave it blank and Keep Track will name the report for you (site name, type, and date range).
- **Report type**:
  - **Historical** — a summary of what has already happened in the period you choose.
  - **Forecast** — adds a look ahead at expected spend for any months in your date range that haven't happened yet, based on recent spending patterns and any planned projects.
  - **Combined** — historical figures plus the forecast, in one report.
- **From / To** — the date range the report covers.
- **Years to include** — how many financial years of annual totals to show in the "Annual totals by category" chart (1–5, default 3). This is separate from your From/To dates — it controls how far back the year-on-year comparison looks, regardless of how short or long your chosen date range is.
- **Categories** — tick which categories to include, or use **Select all / Deselect all**. Leaving everything ticked includes every category (and any uncategorised spend); narrowing it down focuses the report on just the categories you've chosen.
- **Include AI-written summary and key insights** — on by default. Turn it off if you just want the figures, tables, and charts without the written narrative.
- **Include budget vs actual comparison** — only shown if the [Budget Planning](budget-planning.md) module is enabled. Ticked by default if any budgets exist for the current financial year, unticked otherwise. Adds a budget vs actual section to the PDF showing how spending compared to planned budgets — see below.

## Step 3: Generate

Click **Generate report**. This can take 15–30 seconds — Keep Track pulls together the invoices, contributions, and planned projects for your chosen scope, asks the AI to write the summary, and builds the PDF. A spinner shows while it's working.

Once it's done:
- A success message confirms the report was generated.
- The PDF **downloads automatically** to your device — no extra click needed.
- The new report appears at the top of the **Previous reports** table.

## What's in the PDF

- A cover page with the title, site name, date range, and generation date.
- An AI-written executive summary, key insights, any notable trends, and a forward-looking paragraph (if AI summary was included and available).
- Overview metrics: monthly average spend, totals, and current balance.
- An annual totals chart, broken down by category.
- A monthly average cost chart per category.
- For forecast/combined reports: an actual-vs-forecast chart and a forecast breakdown table.
- A **budget vs actual** section, if you ticked that box: each budgeted category's annual budget, actual spend in the report's date range, variance, percent used, and a colour-coded status (green on track, amber warning, red over budget), with a totals row. The AI summary (if included) will call out any category significantly over or under budget by name.
- A funding position table, if contribution data exists for the period.
- A blank notes section at the end, ready for you to add handwritten or typed comments before sharing.

## Step 4: Download a previous report

Every report you've ever generated stays listed in the **Previous reports** table — title, type, date range, categories, who generated it, and when. Click **Download** on any row to get the PDF again at any time; generating a report never changes your underlying data, so it's safe to run as many as you like.

Click **Export CSV** below the table to download the whole Previous reports list itself as a spreadsheet — useful for keeping an external record of what's been generated and when, separate from downloading any individual report's PDF.

## Deleting a report

Only Admins can delete a report, and it asks for confirmation first. Deleting a report removes it from the list — it doesn't affect any invoices, contributions, or other data it was generated from.

## Tips

- If a report doesn't look right, double-check that the invoices and contributions for that period have been entered and confirmed correctly first — reports only include **confirmed** invoices.
- The AI summary is written for a general, non-technical audience — ideal for trustees or committee members who don't need the raw figures explained.
- If the AI summary is ever missing from a report, it's usually because AI summaries were switched off for that report, or the AI call didn't succeed — the rest of the report (figures, tables, charts) is unaffected either way.
- The AI summary needs AI to be configured and enabled first — see **Settings → AI & Extraction** in the [Settings Guide](settings-guide.md). Without it, reports still generate normally; you just won't get the written narrative.

## Related guides

- [Uploading Invoices](uploading-invoices.md) and [Managing Contributions](managing-contributions.md) — the data reports are built from.
- [Budget Planning](budget-planning.md) — the budget vs actual comparison option.
- [Settings Guide](settings-guide.md) — configuring AI for report summaries.
