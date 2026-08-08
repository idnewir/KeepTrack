# Dashboard Guide

The Dashboard is the first thing you see after logging in. It gives you an
immediate financial health snapshot of the site, without needing to dig
into detail — and everything on it can be clicked to see more.

This guide uses Keep Track's default labels — Invoices, Contributions,
Projects, Target Reserve — throughout. An Administrator can rename any of
these from **Settings → Appearance** (see the [Settings Guide](settings-guide.md)),
and the dashboard updates to match automatically.

## The header

The header at the top of every page — not just the dashboard — shows:

- A personal greeting on the right (**Good morning**, **Good afternoon**, or **Good evening**, followed by your name), which changes automatically through the day.
- A **search bar** in the middle. Click it, or press **Cmd+K** (Mac) / **Ctrl+K** (Windows/Linux) from anywhere in the app, to jump straight to it and search across invoices, projects, and contributions without touching the mouse.
- A **notification bell** — click it to open a dropdown list of your notifications (the same underlying alerts as the dashboard banners below, plus a few that only appear here). Unread ones are highlighted; click one to go straight to what it's about, or use **Mark all read** / **Dismiss all** to clear the list down.

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
through August, combining a cash flow bar chart with three lines — inspired
by Actual Budget's cash flow report, so you can see at a glance not just how
much came in and went out, but which months left you better off and which
months didn't.

**Net cash flow bars**, drawn faintly behind the lines, show one bar per
month:

- A **green** bar means that month was a surplus — income was higher than
  spend.
- A **red** bar means that month was a deficit — spend was higher than
  income.
- The taller the bar, the bigger that month's surplus or deficit was,
  relative to the other months shown.

On top of the bars, three lines:

- **Income** (blue) — contributions recorded each month.
- **Actual spend** (green) — confirmed invoices each month.
- **Forecast spend** (amber, dashed) — for months already passed, this just
  matches actual spend; for months still to come, it's an estimate built
  from the average monthly spend per category over the last 3 months.

A fourth line, **Running balance** (grey, dashed), is available but hidden
by default — click it in the legend to show your cumulative balance
(opening balance plus everything in and out since) across the whole year,
useful for spotting whether your overall position is trending up or down
rather than just looking month to month.

Any month with a **planned project** due shows a purple marker on the
forecast line, so a big one-off cost is easy to tell apart from routine
running costs.

**Hovering over a month** (or tapping it, on a phone or tablet) shows a
detailed tooltip: the month's income and its top 3 sources, expenses and
their top 3 categories, the net surplus/deficit for that month, the running
balance at that point, and — for a future month — the forecast amount
expected.

**The legend above the chart is clickable** — click any label (Income,
Actual spend, Forecast spend, Surplus month, Deficit month, Running balance)
to show or hide that element. A dimmed label means it's currently hidden;
click it again to bring it back. This is separate from clicking directly on
a line in the chart itself, which still drills through to the detail behind
it:

- Click the **Income** line to go to the Contributions page.
- Click the **Actual spend** line to see the full list of invoices, already
  filtered to this financial year.
- Click the **Forecast spend** line to see the forecast broken down by
  category — how much each category is expected to cost for the rest of the
  year.

**This year / Last year** — a small toggle above the chart, top right, lets
you flip straight to the previous financial year's figures for a quick
comparison, without needing to change any other setting on the page. It only
shows the chart itself; the metric cards, notifications, and everything else
on the dashboard always describe the current financial year.

On a small screen, the chart simplifies automatically: the surplus/deficit
bars and the Running balance line drop out (there just isn't room to read
them clearly), and the legend moves below the chart instead of above it.

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

## Budget Summary panel

If your Administrator has switched on the
[Budget Planning](budget-planning.md) module, and you're **not** in
Personal Finance mode (see below), an extra **Budget Planning** panel
appears just below the target reserve gauge:

- A large traffic-light **overall status** — On Track, Warning, or Over
  Budget, based on how your budgeted categories are doing overall.
- A progress bar of **total budgeted vs. total spent** so far this
  financial year.
- Up to **three categories** that are over budget or in warning, so you
  can see at a glance what needs attention without leaving the dashboard.
- A **View full budget** link through to the full Budget Planning page.

This panel only appears once the module is enabled — see
[Budget Planning](budget-planning.md) for the full walkthrough of setting
up budgets and reading the traffic-light indicators.

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
- A **Savings goals** panel appears too. If [Budget Planning](budget-planning.md)
  is also enabled, this shows your real active savings goals — name,
  progress bar, and an on-track indicator — with a **View all goals** link
  through to the Savings Goals tab. If Budget Planning isn't enabled yet,
  this panel just points you at Settings → General → Feature Modules.

### The collapsible financial chart

In Personal Finance mode, the "Financial year at a glance" chart described
above is still there, but starts **collapsed** behind a **Show financial
detail** toggle, so debt and net worth take priority on the page. Click the
toggle to expand it smoothly — everything about the chart (the cash flow
bars, hovering or tapping for detail, the clickable legend, the This
year/Last year toggle, clicking a line to drill in) works exactly the same
once expanded.

See the [Debt Tracking](debt-tracking.md) guide for the full picture,
including the payoff calculator and milestone notifications, and the
[Budget Planning](budget-planning.md) guide for setting up the savings
goals shown here.

## On mobile

The dashboard is fully responsive: the sidebar tucks behind the menu
button, the four metric cards stack, and the panels move to a single
column, so everything is still readable and clickable on a phone browser.

## Related guides

- [Getting Started](getting-started.md) — logging in and finding your way around for the first time.
- [Debt Tracking](debt-tracking.md) — the full picture behind Personal Finance mode.
- [Budget Planning](budget-planning.md) — the full picture behind the Budget Summary and Savings Goals panels.
- [Managing Contributions](managing-contributions.md) — where the income side of the chart comes from.
- [Uploading Invoices](uploading-invoices.md) — where the spend side of the chart comes from.
