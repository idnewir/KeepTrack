# Dashboard Guide

The Dashboard is the first thing you see after logging in. It gives you an
immediate financial health snapshot of the site, without needing to dig
into detail — and everything on it can be clicked to see more.

## Notification banners

If something needs your attention, you'll see a coloured banner at the very
top of the page as soon as you log in:

- **Amber** banners are warnings worth knowing about (an invoice waiting for
  review, a confirmed invoice that still needs signing, or the balance
  drifting close to the target reserve).
- **Red** banners are more urgent (the balance has actually dropped below
  the target reserve).

Click a banner to go straight to the relevant page. Click the **×** to
dismiss it — it'll come back next time you log in if the underlying issue
is still there, so dismissing just clears it from view for now.

## The financial year

Just under the page title you'll see which financial year you're currently
looking at (e.g. "Financial year 2025/26") and its date range. Keep Track's
financial year runs **September to August** by default, and the dashboard
always shows the one containing today's date.

## Quick actions

Shortcut buttons for the things you do most often: **Upload invoice**,
**Record contribution**, and **Run report**.

## The four metric cards

Across the top of the page:

- **Monthly average cost** — the average confirmed spend per month so far
  this financial year.
- **Total spent this year** — every confirmed invoice's amount, added up,
  for the current financial year.
- **Total income this year** — every contribution recorded for the current
  financial year.
- **Current balance** — income minus spend so far. This card is
  colour-coded: **green** if the balance is comfortably above the target
  reserve, **amber** if it's within 10% of it, **red** if it's below.

## The main chart

"Financial year at a glance" plots the whole financial year, September
through August, with three lines:

- **Income** (blue) — contributions recorded each month.
- **Actual spend** (green) — confirmed invoices each month.
- **Forecast spend** (amber, dashed) — for months already passed, this just
  matches actual spend; for months still to come, it's an estimate built
  from the average monthly spend per category over the last 3 months.

Any month with a **planned project** due shows a purple marker on the
forecast line, so a big one-off cost is easy to tell apart from routine
running costs.

Move your mouse over the chart to see the exact figures for any month.
Click anywhere on the chart, or click one of the coloured labels above it,
to drill in:

- Click **Income** to go to the Contributions page.
- Click **Actual spend** to see the full list of invoices, already filtered
  to this financial year.
- Click **Forecast spend** to see the forecast broken down by category —
  how much each category is expected to cost for the rest of the year.

## Target reserve

A simple bar showing your current balance against the target reserve — the
reserve is calculated automatically as the average monthly spend over the
last 3 months, so it adjusts itself as spending patterns change. The label
underneath shows the exact figures, e.g. "Balance £1,240 / Target £900".
The bar is coloured the same way as the balance card: green, amber, or red.

## The panels

Below the chart and gauge, three panels:

- **Upcoming expected invoices** — suppliers who've billed at least twice
  in the last 3 months, with an estimated amount and roughly when they're
  next expected. This fills in naturally as invoice history builds up.
- **Planned projects** — every active planned project, with its estimated
  cost and expected month. A link here takes you to manage projects.
- **Recent activity** — the last 5 confirmed invoices, with date, supplier,
  amount, and a coloured swatch for the category. Click one to open it.

Each panel shows a friendly message instead of an empty box when there's
nothing to show yet — this is normal on a fresh install and fills in as you
use the app.

## Personal Finance mode

If your Administrator has switched on the [Debt Tracking](debt-tracking.md)
module, the Dashboard automatically switches to **Personal Finance mode** —
this isn't a separate setting, it happens the moment the module is turned
on, and switches back the moment it's turned off. In this mode:

- The four metric cards across the top change to **Net worth** (your
  available funds minus your total debt — red if negative, green if
  positive), **Total debt** (red), **Monthly payments due** (amber), and
  **Available funds**.
- A **Debt summary** panel lists every active debt with its balance, rate,
  and next payment date, with a promotional rate expiring soon highlighted
  in amber, and a link through to the full Debts page.
- A **Payments due this month** panel lists what's due and when, in order
  of due date, with anything overdue shown in red.
- A **Savings goals** panel appears too, currently a placeholder until the
  separate Budget Planning module is built.

### The collapsible financial chart

In Personal Finance mode, the "Financial year at a glance" chart described
above is still there, but starts **collapsed** behind a **Show financial
detail** toggle, so debt and net worth take priority on the page. Click the
toggle to expand it smoothly — everything about the chart (hovering for
detail, clicking a series to drill in) works exactly the same once
expanded.

See the [Debt Tracking](debt-tracking.md) guide for the full picture,
including the payoff calculator and milestone notifications.

## On mobile

The dashboard is fully responsive: the sidebar tucks behind the menu
button, the four metric cards stack, and the panels move to a single
column, so everything is still readable and clickable on a phone browser.
