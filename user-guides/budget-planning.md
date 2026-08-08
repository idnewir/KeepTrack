# Budget Planning

Budget Planning lets you set an annual spending target for each category,
see how actual spend is tracking against it month by month, and save toward
specific goals — with clear traffic-light warnings when a category is
getting close to, or has gone over, its budget.

## What Budget Planning is — and isn't

Budget Planning is a **complement to invoice management**, not a
replacement for it. It answers "how does what we've actually spent compare
to what we planned to spend?" — it doesn't try to plan where every pound of
income should go before it arrives, and it isn't a full personal finance
app like YNAB or a zero-based budgeting tool.

Concretely, in this first version:

- You set an **annual budget per category**, optionally with different
  amounts for specific months (e.g. more for Electricity in December and
  January).
- Keep Track shows you **actual spend against that budget**, month by
  month and year to date, with clear on-track/warning/over-budget
  indicators.
- You can set **savings goals** — a target amount and date — and log
  contributions toward them, optionally linked to a budget category.

See the "V1 scope" note at the end of this guide for what's deliberately
left out of this version.

## Enabling it

This is a [feature module](feature-modules.md), switched **off** by
default.

1. Go to **Settings → General → Feature Modules**.
2. Find **Budget Planning** and click its switch. (Only Administrators can
   do this — everyone else sees the list but can't change it.)
3. A short prompt appears asking what you'd like to call the module — the
   default is "Budget Planning", but you can rename it to anything that
   suits you (e.g. "Envelopes"). You can also skip this and rename it
   later from Settings → Appearance.

Once enabled, a new **Budget Planning** link appears in the sidebar
(positioned after Reports, and before Debts if that module is also
enabled), and the Dashboard, Reports page, and Settings → Appearance all
gain the extra sections described below.

## Setting up your first budget

1. Go to **Budget Planning** in the sidebar — you'll land on the
   **Budgets** tab.
2. Check the **financial year selector** at the top is showing the year
   you want to budget for (it defaults to the current one).
3. Click **+ Set budget** (Administrators only).
4. Choose a **category** — categories that don't have a budget yet for
   this financial year are listed first, so it's easy to see what's still
   left to cover.
5. Enter the **annual budget amount** (£).
6. Optionally, click **Set monthly overrides** to give specific months a
   different figure than the plain annual average — see below.
7. Click **Save**.

Your new budget appears immediately in the year overview, and any past
spend in that category is compared against it straight away.

## Understanding annual budgets with monthly overrides

By default, an annual budget is simply split evenly across the year — a
£1,200 annual Electricity budget becomes £100 a month. If some months
genuinely cost more than others (heating in winter, for example), open
**Set monthly overrides** on the Add/Edit budget form and enter a
different figure for just the months that need one; every month you leave
alone still falls back to the plain annual-amount-divided-by-12 figure.

For example, an Electricity budget of £1,200/year with £150 set for both
December and January means: £100/month for the other ten months, £150 for
December, and £150 for January — still totalling more than a flat £1,200
split evenly, which is the point: some categories genuinely aren't level
across the year, and the budget should reflect that rather than flagging a
false "over budget" warning every winter.

You can come back and adjust monthly overrides at any time from a
category's monthly detail view (see below) by clicking **Edit budget**.

## Reading the budget overview

The **Budgets** tab shows every category with a budget for the selected
financial year, in either of two layouts:

- **Table view** — a clean row per category: annual budget, spent to
  date, remaining, % used (colour-coded), and a status badge, with a thin
  progress bar underneath each row.
- **Card view** — the same figures shown as a card per category, with a
  larger, more visual progress bar. This is aimed at a more personal,
  glanceable style.

A small **Table view / Card view** toggle in the top right switches
between them — Keep Track suggests Card view by default once Debt
Tracking (personal finance) is enabled, and Table view otherwise, but your
choice is remembered in your browser from then on, whichever you pick.

Click any category (row or card) to open its **monthly detail**: the
annual budget, then a month-by-month breakdown of budget, actual spend,
variance, and a traffic light status for each month, in financial-year
order. Administrators can click **Edit budget** from here to change the
annual amount or the monthly overrides, or **Remove budget** to delete it
entirely.

Below the overview, an **Unbudgeted categories** section lists any
category that has actual spend recorded but no budget set yet for this
financial year, along with how much has been spent so far — a quick way
to spot gaps. Click **Set budget** next to one to jump straight into the
add form with that category pre-selected.

## Understanding traffic light indicators

Every budget — overall and per month — is shown as one of three states,
based on how much of the relevant budget has been used:

- 🟢 **On Track** — under 80% used.
- 🟠 **Warning** — 80% or more used, but not yet over.
- 🔴 **Over Budget** — 100% or more used.

The same three colours are used consistently across the table, the cards,
the monthly detail view, the dashboard panel, and the PDF report, so a red
badge always means the same thing wherever you see it.

## Setting up savings goals

1. Go to **Budget Planning → Savings Goals** (or use the tab at the top of
   the Budget Planning page).
2. Click **+ Add savings goal** (Standard or Admin).
3. Fill in a **name** (e.g. "New boiler fund"), an optional
   **description**, the **target amount**, and a **target month** — a
   month/year picker, since a savings goal is usually aimed at "by some
   point next spring" rather than an exact day.
4. Optionally, **link it to a budget category** — this is purely
   informational for now (it doesn't move money or affect that category's
   budget figures), useful for keeping a savings goal visually grouped
   with the spending area it relates to.
5. Click **Save**.

Each goal card shows its progress bar, current amount vs. target, the
target date and how many months remain, and how much you'd need to add
each remaining month to hit the target on time — plus an **on track**
indicator (✓ green) or a **behind target** warning (⚠ amber), based on
whether what you've saved so far keeps pace with a straight line from
when the goal was created to its target date.

## Adding contributions to savings goals

From a goal's card, click **Add contribution**, enter an amount and an
optional note, and save. This increases the goal's current amount
immediately. If a contribution takes the current amount to, or past, the
target amount, the goal is **automatically marked complete** — you'll get
a notification (*"Savings goal '[name]' completed!"*) and it moves into
the collapsed **Completed savings goals** section at the bottom of the
tab, shown with a green tick and its completion date.

You don't have to wait for a contribution to finish a goal exactly on the
target — **Mark complete** (Standard or Admin) finishes it early at
whatever amount it's currently at. **Cancel goal** (Administrators only)
retires a goal you no longer want to pursue; it's a soft removal, so its
contribution history isn't lost, it just stops appearing in the active
list.

## Budget vs actual in reports

When Budget Planning is enabled, the report generation form on the
**Reports** page gains an extra checkbox: **Include budget vs actual
comparison**. It's ticked by default if any budgets exist for the current
financial year, unticked otherwise — you can always change it either way
before generating.

Turning it on adds a **Budget vs. actual** section to the PDF: a table of
every budgeted category's annual budget, actual spend in the report's
date range, variance, percent used, and status (colour-coded the same
green/amber/red as everywhere else), with a totals row summarising the
whole picture. If you've also asked for an AI-written summary, it will
call out any category that's significantly over budget or close to it, by
name — the same way it already does for planned projects running over
their estimate.

## Understanding the dashboard panels

**Organisational mode** (Debt Tracking not enabled): a **Budget Planning**
panel appears on the Dashboard, below the target reserve gauge, showing
the overall status as a traffic light, a progress bar of total budgeted
vs. total spent, up to three categories that are over budget or in
warning, and a **View full budget** link through to the full page.

**Personal Finance mode** (Debt Tracking enabled): the dashboard's
previously placeholder **Savings goals** panel now shows your real active
goals — name, progress bar, on-track indicator — with a **View all
goals** link straight to the Savings Goals tab.

Either way, the panel only appears once the module is enabled — with it
switched off, neither panel is shown.

## Customising terminology

If "Budget Planning", "Budget", or "Savings Goal" don't read naturally for
how you use Keep Track, rename all three from **Settings → Appearance →
Budget Planning terminology**:

- **Module name label** — default *Budget Planning*. Try *Envelopes*.
- **Budget label** — default *Budget*. Try *Allowance* or *Envelope*.
- **Savings goal label** — default *Savings Goal*. Try *Sinking Fund*.

These labels update throughout the app automatically — the sidebar link,
tab names, and button text all pick up your renamed labels immediately
after saving, no page refresh needed.

## Frequently asked questions

**What happens to my budgets and goals if I turn the module off?**
Nothing is deleted. Turning Budget Planning off just hides the Budget
Planning page, the sidebar link, and the dashboard panels — every budget
and savings goal you've set up is exactly where you left it, and
reappears the moment you turn the module back on.

**Does linking a savings goal to a category do anything to that
category's budget?**
No — the link is informational only in this version. It doesn't move
spend between them or affect either figure.

**Who can set and edit budgets?**
Any logged-in user can view budgets and the overview. Setting, editing,
and deleting a budget is Administrator-only. Savings goals are more open:
any Standard or Admin user can create, edit, and contribute to a goal;
only an Admin can cancel one.

**Can I roll over an unused budget into next month, or copy last month's
figures forward?**
Not in this version — see the V1 scope note below.

## V1 scope note

Budget Planning V1 focuses on annual budgets and savings goals. Full
envelope budgeting with income allocation is planned for a future
version.

## Related guides

- [Debt Tracking](debt-tracking.md) — Personal Finance mode, where the Savings Goals panel also appears.
- [Dashboard Guide](dashboard-guide.md) — the Budget Summary panel in organisational mode.
- [Reports Guide](reports-guide.md) — including a budget vs actual comparison in a PDF report.
- [Feature Modules](feature-modules.md) — how enabling and disabling modules works generally.
- [Settings Guide](settings-guide.md) — renaming "Budget Planning", "Budget", and "Savings Goal".
