// Explanatory tooltip text for the status badges used across the app —
// shared across the pages that render the same badge (e.g. the invoice
// table on both InvoicesPage and SearchResultsPage) so the wording can't
// drift between them. See docs/decisions-log.md.

export const INVOICE_BADGE_TOOLTIPS = {
  unreviewed: 'This invoice has been uploaded but not yet reviewed and confirmed. Click to open and review.',
  reviewed: 'This invoice has been reviewed and confirmed.',
  unsigned: 'This invoice has been confirmed but not yet signed. Open the invoice to sign and export.',
  signed: 'This invoice has been signed and exported.',
  historical: 'This invoice was imported as historical data. It does not require signing or review.',
  duplicate: 'This invoice was flagged as a possible duplicate when imported. Review carefully before confirming.',
}

export const RECONCILIATION_BADGE_TOOLTIPS = {
  stale: 'Data changed after this reconciliation was completed. The calculated balance may no longer be accurate. Click Edit to update it.',
  reconciled: 'This month has been reconciled against your actual bank balance.',
  not_reconciled: 'This month has not yet been reconciled. Enter your actual bank balance to reconcile.',
}

export const PROJECT_BADGE_TOOLTIPS = {
  dueSoon: 'This project is due within 60 days.',
  overdue: 'This project is overdue — the expected month has passed.',
  overBudget: 'Actual spend on linked invoices has exceeded the estimated cost for this project.',
  fundingOnTrack: 'Based on your current monthly surplus, you are on track to reach your funding target.',
  fundingBehind:
    'Based on your current monthly surplus, you may not reach your funding target in time. Consider increasing your monthly surplus.',
}

export const DEBT_BADGE_TOOLTIPS = {
  progressBad: 'Less than 25% of this debt has been paid off.',
  progressAmber: 'Between 25% and 50% of this debt has been paid off. Keep going!',
  progressGood: 'More than 50% of this debt has been paid off. Great progress!',
}

export function promoWarningTooltip(daysRemaining, standardRate) {
  const dayText = daysRemaining != null ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}` : 'a set number of days'
  const rateText = standardRate != null ? `${Number(standardRate)}%` : 'the standard'
  return `This promotional rate expires in ${dayText}. After this date, the standard rate of ${rateText} will apply.`
}

export const BUDGET_BADGE_TOOLTIPS = {
  overBudget: 'Actual spend has exceeded the budget for this category this month.',
  warning: 'Actual spend has reached 80% or more of the budget for this category.',
  onTrack: 'Actual spend is within budget for this category.',
}
