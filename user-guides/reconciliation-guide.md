# Reconciliation Guide

Reconciliation is the monthly check to make sure Keep Track's numbers match
what the bank actually shows. This guide walks you through it on the
**Reconciliation** page.

"Reconciliation" is the default label — an Administrator can rename it from
**Settings → Appearance** if it doesn't suit how you use Keep Track; see the
[Settings Guide](settings-guide.md). This guide uses the default name
throughout.

## Who can do this

Administrators and Standard users can carry out reconciliation and add
notes. Read-only users can view past reconciliations but cannot submit new
ones or edit notes.

## Why it matters

Keep Track works out a **calculated balance** automatically for any given
month: the financial year's opening balance, plus every contribution
recorded up to and including that month, minus every confirmed invoice up to
and including that month. But mistakes happen — an invoice might be missed,
or a contribution forgotten. Reconciliation catches these before they build
up, and it needs the [opening balance](managing-contributions.md) to be set
first or the figures won't be meaningful.

## Step-by-step

1. Go to the **Reconciliation** page from the sidebar. You'll see a tile for
   every month in the current financial year.
2. Click a month's tile to select it. Tiles are marked **Reconciled**,
   **Not reconciled**, or **Overdue** (an unreconciled month that's already
   in the past) at a glance.
3. For the selected month, Keep Track shows the **calculated balance** —
   this is what the app thinks the balance should be, based on contributions
   and invoices recorded so far.
4. Get your bank statement (or online banking app) and find the actual
   balance at the end of that month.
5. Type that figure into the **actual balance** box and click **Reconcile**.

## What happens next

Keep Track works out the **discrepancy** (actual balance minus calculated
balance) and shows a suggested reason, colour-coded:

- **Green, zero** — fully reconciled, no discrepancy at all.
- **Amber, small** — a small positive discrepancy suggests bank interest or
  unrecorded income; a small negative one suggests a bank charge or an
  unrecorded invoice.
- **Red, large** — likely a missing invoice or contribution, worth checking
  closely.

A month, once reconciled, is locked for everyday editing — the actual
balance and discrepancy can't be changed by a Standard user. If you need to
explain what you found (or are still investigating), use the **Notes** box
underneath; notes can be added or updated at any time, by anyone who can
reconcile, even after the month is reconciled.

## Correcting a reconciled month (Administrators only)

Sometimes a reconciled month turns out to need fixing — a figure was
mistyped, or new information comes to light. An Administrator can click
**Edit (Admin)** on a reconciled month to reopen it: change the actual
balance and notes, add a reason for the correction, and save. Keep Track
recalculates the discrepancy from the new figure and records the
correction — including who made it, when, and why — against your account.

If a month has been flagged **stale** (see below), the same button reads
**Edit now — bring up to date** instead, making it obvious that a
correction is expected, not just possible.

## Why a reconciliation can go stale

If an invoice or contribution affecting an already-reconciled month is
added, edited, or deleted afterwards, Keep Track automatically marks that
month's reconciliation as **stale** — a clear signal that the actual
balance you entered may no longer match the recalculated figures. A stale
month shows an amber "⚠ Data changed since reconciliation" banner with the
details of what changed (the original balance when reconciled, the current
calculated balance, and the difference), and stays marked stale until an
Administrator corrects it using **Edit now — bring up to date** above.

## Unreconciled and overdue months

Months that are already in the past but haven't been reconciled yet are
flagged as **Overdue**, both on their tile and in a banner near the top of
the page listing every overdue month at a glance — reconcile these first.

## Tips

- Try to reconcile every month, as soon as your bank statement is available
  — small discrepancies are much easier to track down quickly than after
  several months have passed.
- If you can't find the cause of a discrepancy straight away, reconcile
  anyway with a note explaining what you know so far — you can always add
  more detail to the note later.

## Related guides

- [Managing Contributions](managing-contributions.md) — setting the opening balance reconciliation depends on.
- [Uploading Invoices](uploading-invoices.md) — confirmed invoices feed into the calculated balance.
- [Dashboard Guide](dashboard-guide.md) — the target reserve gauge, which also depends on an accurate balance.
- [Settings Guide](settings-guide.md) — renaming "Reconciliation" and setting the financial year.
