// Explanatory tooltip text for each persistent notification `type`
// (services/notification_service.py) — shown via an (i) icon in the
// notification centre (NotificationBell.jsx) and on the dashboard's live
// banners (DashboardPage.jsx), so a notification is self-explanatory
// without a trip to the help section. Static, not interpolated with a
// specific notification's own figures (a month, a percentage, a day
// count) — the notification's own message text already carries those; this
// is the generic "what does this mean and what should I do" layer next to
// it. See docs/decisions-log.md.
export const NOTIFICATION_TOOLTIPS = {
  balance_warning:
    'Your current balance has fallen below your target reserve. The target reserve is a set number of ' +
    'months of average expenses kept as a safety buffer. Consider reviewing your income or reducing spend.',
  unsigned_invoice:
    'This invoice has been confirmed but not yet signed. If signing is enabled, signed copies are ' +
    'required for your records. Open the invoice to sign and export it.',
  stale_reconciliation:
    'A reconciliation has been marked as stale because income or expenses for that month changed after ' +
    'it was completed. Open Reconciliation to review and update it.',
  critical_error:
    'A critical error has occurred in the system. This may affect how Keep Track processes invoices or ' +
    'saves data. Visit Settings → Logs → Error Log for details.',
  reconciliation_overdue:
    'A monthly reconciliation has not been completed. Reconciliation checks your calculated balance ' +
    'against your actual bank balance to catch any missing invoices or income.',
  project_overdue:
    'A planned project was expected to start or complete this month but has not been marked as done. ' +
    'Visit Projects to review and update its status.',
  promo_rate_expiring:
    'A promotional interest rate on one of your debts is about to expire. Once it expires, the standard ' +
    'rate will apply and your monthly interest will increase. Visit Debt Tracking to review.',
  budget_warning:
    'A budget category has reached 80% of its monthly budget. You are close to exceeding your planned ' +
    'spend for this category.',
  budget_over:
    'A budget category has exceeded its monthly budget. Your actual spend is higher than planned for ' +
    'this category this month.',
}
