# Debt Tracking

Debt Tracking lets you log every loan, credit card, mortgage, car finance
agreement, overdraft, or Buy Now Pay Later plan you're paying off, record
payments as you make them, and see a clear, calculated timeline for when
each one will be gone.

## Who it's for

This is a **personal finance** module, not an organisational one — it's
built for tracking your own (or your household's) debts, not a charity's or
club's running costs. If you're using Keep Track for a committee or shared
site, Debt Tracking probably isn't relevant to you; if you're using it to
keep on top of your own finances, this is where you do it.

## Enabling it

This is a [feature module](feature-modules.md), switched **off** by
default.

1. Go to **Settings → General → Feature Modules**.
2. Find **Debt Tracking** and click its switch. (Only Administrators can do
   this — everyone else sees the list but can't change it.)
3. A short prompt appears asking what you'd like to call the module — the
   default is "Debt Tracking", but you can rename it to anything that suits
   you (e.g. "Loans & Cards"). You can also skip this and rename it later
   from Settings → Appearance.

## What changes when it's enabled

Turning Debt Tracking on does two things immediately, for every role:

- A new **Debts** link appears in the sidebar, after Reports and before
  Settings.
- The **Dashboard switches to Personal Finance mode** automatically — this
  isn't something you choose separately. The dashboard's top row changes to
  show your net worth, total debt, and monthly payments due, and a couple
  of debt-specific panels appear. See "The Personal Finance dashboard"
  below.

## Adding your first debt

1. Go to **Debts** in the sidebar, then click **+ Add debt**.
2. Fill in the **basic details**: a name (e.g. "Barclaycard", "Car loan"),
   a type (see below), the current balance, and — for credit cards and
   overdrafts — an optional credit limit. Add any notes you want to keep
   alongside it.
3. Fill in the **payment details**: your monthly payment amount, the day of
   the month it's due (1–31), when the debt started, and (optionally) when
   you expect it to end.
4. Set the **interest rate**: choose Standard, Promotional, or 0% /
   Interest Free, and fill in the rate (see "Setting up promotional rates
   correctly" below).
5. As you fill in the balance, rate, and payment, a **live preview**
   updates underneath, showing roughly how many months it'll take to pay
   off at those figures — a quick sanity check before you save.
6. Click **Add debt**.

## Understanding debt types

Pick whichever type best describes the debt — it only affects how it's
labelled and, for credit cards and overdrafts, whether a credit limit field
is shown. It doesn't change how the payoff calculator works.

- **Credit Card** — a revolving balance with a credit limit.
- **Loan** — a personal loan or similar fixed-term borrowing.
- **Mortgage** — borrowing secured against a property.
- **Car Finance** — a car loan or PCP/HP agreement.
- **Overdraft** — an agreed overdraft on a current account.
- **Buy Now Pay Later** — a BNPL/instalment plan (Klarna, Clearpay, and
  similar).
- **Other** — anything that doesn't fit the above; you'll be asked for a
  custom label so it still shows up clearly in your debt list.

## Setting up promotional rates correctly

Many credit cards and some loans start with a **promotional** rate — often
0% — that later reverts to a higher **standard** rate. Debt Tracking models
this properly so your payoff figures aren't misleading:

- Choose **Promotional** if there's a reduced (but non-zero) introductory
  rate, or **0% / Interest Free** if there's no interest at all during the
  promotional period.
- You'll then be asked for the **promotional end date** and the **standard
  rate that applies after it** — both are required, since without them
  Keep Track can't tell you what happens once the promotional period ends.
- Once saved, the debt's card and detail page show the promotional rate in
  **green**, with a countdown of days remaining, so it's obvious at a
  glance that the rate won't last forever.

## Understanding the payoff calculator

Every debt with a **standard** rate shows a single set of figures, on its
detail page:

- **Months remaining** — how many more months of payments it'll take at
  the current balance, rate, and monthly payment.
- **Total interest to pay** — the total interest you'll pay over that time.
- **Total amount to pay** — balance plus total interest.
- **Estimated payoff date**.

If your monthly payment doesn't even cover the interest accruing each
month, Keep Track shows a clear warning instead of a misleading month
count: *"Your monthly payment does not cover the interest. Your balance is
growing by £X per month."* — worth acting on quickly, since the balance
will only get bigger until the payment goes up or the rate comes down.

## Understanding the dual scenario calculator for promotional rates

For a debt on a promotional or 0% rate, the single calculator above isn't
the whole story — what happens once the promotional period ends matters
too. Instead, you'll see **two panels side by side**:

- **At current [X]% rate** — what would happen if the promotional rate
  applied for the whole remaining balance (an optimistic best case, useful
  for comparison).
- **Once standard [X]% rate applies** — the realistic projection: the
  promotional rate for however long is left, then the standard rate for
  whatever balance remains after that.

Underneath, Keep Track tells you plainly how much more the standard-rate
scenario costs in interest — e.g. *"You will pay £340 more in interest if
not paid off before the promotional rate ends"* — so you can decide whether
it's worth increasing payments to clear the balance before the rate
changes.

If a promotional/0% debt's end date is within 30 days, a dedicated **amber
warning panel** also appears on its detail page: how many days are left,
what the rate becomes afterwards, and a suggested monthly payment to clear
the balance before the rate changes.

## Logging payments and tracking progress

- From the Debts list or a debt's own detail page, click **Log payment**.
- The amount is pre-filled with the debt's usual monthly payment and the
  date defaults to today — adjust either if this payment was different, add
  a note if useful, and save.
- The debt's balance reduces immediately, and its progress bar updates —
  green once you've paid off more than half, amber between 25–50%, red
  below 25%.
- If a payment brings the balance to zero (or below), the debt is
  automatically marked as **paid off** — you don't need to do anything
  extra.
- An Administrator can delete a mistaken payment from the payment history
  table on the debt's detail page; the balance is restored automatically
  when they do.

## Understanding milestone notifications (25/50/75/100%)

Every time a payment (or the automatic full payoff) takes a debt's
percentage paid past 25%, 50%, 75%, or 100%, you get a notification:
*"Debt milestone reached! You have paid off 50% of Barclaycard! Keep it
up!"* Each milestone only ever fires **once** per debt — even if the
balance later goes up and back down again, you won't be re-notified for a
threshold you've already passed.

## How the Personal Finance dashboard works

With Debt Tracking enabled, your Dashboard's top row shows:

- **Net worth** — your available funds minus your total debt. This can be
  negative (shown in red) if you owe more than you currently hold, or
  positive (green) otherwise.
- **Total debt** — the sum of every active debt's current balance.
- **Monthly payments due** — the sum of every active debt's monthly
  payment.
- **Available funds** — your current balance from contributions/
  reconciliation, same figure the standard dashboard shows.

Below that, a **Debt summary** panel lists every active debt with its
balance, rate, and next payment date (promotional rates expiring soon are
highlighted in amber), and a **payments due this month** panel lists
what's due and when, in order, with anything overdue shown in red. A
**Savings goals** panel is also shown: if the [Budget Planning](budget-planning.md)
module is also enabled, this shows your real active savings goals — name,
progress bar, and an on-track indicator — with a **View all goals** link
through to the Savings Goals tab. If Budget Planning isn't enabled yet,
this panel just points you at Settings → General → Feature Modules to
explore that module.

## The collapsible financial chart

The familiar "Financial year at a glance" income/expenses/forecast chart is
still there in Personal Finance mode, but it's **collapsed by default**
behind a **Show financial detail** toggle — since the point of Personal
Finance mode is to put debt and net worth front and centre, not to bury
them under a chart most personal users check less often. Click the toggle
to expand it; it works exactly as it always has, including clicking into
income, spend, or forecast detail.

## Customising terminology in Settings → Appearance

If "Debt Tracking", "Debt", or "Payment" don't read naturally for how you
use Keep Track, you can rename all three from **Settings → Appearance →
Debt Tracking terminology**:

- **Module name label** — default *Debt Tracking*.
- **Debt label** — default *Debt*. Try *Loan* or *Balance*.
- **Payment label** — default *Payment*. Try *Repayment* or *Instalment*.

These labels update throughout the app automatically — the sidebar link,
page headings, and button text all pick up your renamed labels immediately
after saving, no page refresh needed.

## Marking a debt as paid off

You don't have to wait for a payment to bring the balance to exactly zero —
from a debt's detail page, click **Mark as paid off** and confirm. This
sets its balance to zero, records today's date as the payoff date, and
fires the 100% milestone notification if it hasn't already fired. The debt
then moves into the **Paid off debts** collapsed section at the bottom of
the Debts list, shown with a green tick and its completion date.

## Frequently asked questions

**Can I track a debt that isn't mine alone (e.g. a joint mortgage)?**
Not specifically yet — Debt Tracking currently has no concept of shared or
joint debts; log it as a single debt for now.

**What happens to my debts if I turn the module off?**
Nothing is deleted. Turning Debt Tracking off just hides the Debts page,
the sidebar link, and the dashboard's Personal Finance mode — every debt,
payment, and milestone you've recorded is exactly where you left it, and
reappears the moment you turn the module back on.

**Does the payoff calculator account for extra one-off payments?**
Each logged payment reduces the balance the calculator works from
immediately, so future projections always reflect your real, current
balance — but the calculator itself assumes a constant monthly payment
going forward, not planned future lump sums.

**Why is my balance growing instead of shrinking?**
This means your monthly payment is lower than the interest currently
accruing each month — Keep Track will warn you clearly on the debt's detail
page when this is happening. Increasing the monthly payment (or waiting out
a promotional rate, if applicable) is the way to fix it.

**Can Standard and Read Only users see debts?**
Any logged-in user can view the Debts list and detail pages. Adding debts,
editing them, marking them paid, and logging payments needs a Standard or
Admin role; deleting a debt or a payment needs an Admin.

## Related guides

- [Budget Planning](budget-planning.md) — savings goals, shown alongside debts in Personal Finance mode.
- [Dashboard Guide](dashboard-guide.md) — the full picture of Personal Finance mode, including the collapsible chart.
- [Feature Modules](feature-modules.md) — how enabling and disabling modules works generally.
- [Settings Guide](settings-guide.md) — renaming "Debt Tracking", "Debt", and "Payment".
