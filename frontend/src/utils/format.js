// Full month names, indexed 0 (January) - 11 (December) — shared by the
// financial year start month dropdown on Settings and the setup wizard.
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Best-effort singular of a configured plural terminology label (e.g.
// "Invoices" -> "Invoice", "Bills" -> "Bill") for phrases like "Upload
// invoice". Not linguistically perfect for every possible custom term, but
// covers plain -s/-ies plurals, which is what the shipped terms (and their
// likely renames) actually are.
export function singularize(word) {
  if (!word) return word
  if (word.toLowerCase().endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.toLowerCase().endsWith('s') && !word.toLowerCase().endsWith('ss')) return word.slice(0, -1)
  return word
}

export function formatCurrency(amount) {
  const value = Number(amount) || 0
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCurrencyCompact(amount) {
  const value = Number(amount) || 0
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Relative time for "Last login" columns — falls back to a full date once
// it's more than a month ago, since "27 days ago" stops being useful further out.
export function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never'
  const then = new Date(dateStr)
  const diffMs = Date.now() - then.getTime()
  const diffMin = Math.round(diffMs / 60000)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return formatDate(dateStr)
}

// Time-ago for the notification centre — same shape as formatRelativeTime
// above but says "Yesterday" for a 1-day-old notification (per this
// feature's brief) rather than "1 day ago", which formatRelativeTime's
// existing callers (e.g. "Last login" columns) don't ask for.
export function formatNotificationTime(dateStr) {
  if (!dateStr) return ''
  const then = new Date(dateStr)
  const diffMs = Date.now() - then.getTime()
  const diffMin = Math.round(diffMs / 60000)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return formatDate(dateStr)
}

// Full absolute date + time for log tables, where "3 days ago" is less
// useful than knowing exactly when something happened.
export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Colour-codes an audit log row by its action_type, per the Logs page spec:
// green = create, blue = edit/update, amber = settings changes, red =
// delete/security events. Matched by suffix/substring against this app's
// own action_type vocabulary (see docs/decisions-log.md) rather than an
// exhaustive lookup table, so a new action type still falls into a
// reasonable bucket by its name alone.
export function auditActionColor(actionType) {
  if (!actionType) return 'blue'
  if (actionType.startsWith('settings.')) return 'amber'
  if (
    actionType.includes('deleted') ||
    actionType.includes('rejected') ||
    actionType.includes('deactivated') ||
    actionType.includes('failed') ||
    actionType === 'system.reset'
  ) {
    return 'red'
  }
  if (
    actionType.includes('created') ||
    actionType.includes('uploaded') ||
    actionType.includes('submitted') ||
    actionType.includes('approved') ||
    actionType.includes('reactivated') ||
    actionType.includes('generated') ||
    actionType.includes('login') ||
    actionType.includes('logout') ||
    actionType.includes('archived')
  ) {
    return 'green'
  }
  return 'blue'
}

// Client-side approximation of backend/services/debt_calculator.py's
// calculate_payoff, for the Add Debt form's live preview only — the
// authoritative figures shown on the debt list/detail pages always come
// from the backend. Returns null when there isn't enough to compute yet,
// { warning: true } when the payment doesn't cover the interest, or
// { months } otherwise.
export function estimateDebtPayoffMonths(balance, annualRatePercent, monthlyPayment) {
  const b = Number(balance)
  const payment = Number(monthlyPayment)
  const rate = Number(annualRatePercent) / 100 / 12
  if (!b || b <= 0 || !payment || payment <= 0) return null
  const monthlyInterest = b * rate
  if (rate > 0 && payment <= monthlyInterest) return { warning: true }
  if (rate === 0) return { months: Math.ceil(b / payment) }
  const months = Math.ceil(-Math.log(1 - (rate * b) / payment) / Math.log(1 + rate))
  return { months: Math.max(months, 1) }
}

// Adds `months` calendar months to today and formats it, for the Add Debt
// form's "paid off in approximately X months (DATE)" preview line.
export function addMonthsFromToday(months) {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return formatMonthYear(d.toISOString().slice(0, 10))
}

export function formatMonthYear(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// The 12 (year, month) pairs of a financial year, in order — shared by any
// page that needs to walk every month of the FY (Contributions, Reconciliation).
export function monthsInFinancialYear(fy) {
  if (!fy) return []
  const start = new Date(fy.start_date)
  const months = []
  for (let i = 0; i < 12; i++) {
    months.push({ year: start.getFullYear(), month: start.getMonth() + 1 })
    start.setMonth(start.getMonth() + 1)
  }
  return months
}

// Urgency of a planned project's expected_month relative to today — used to
// amber/red-highlight projects on both the Projects page and the dashboard
// panel, per docs/features.md#5 ("within 60 days" / "expected month has
// passed"). "Overdue" means the whole expected month has elapsed, not just
// its first day, since a project due later this month isn't overdue yet.
export function projectUrgency(expectedMonthStr, today = new Date()) {
  const monthStart = new Date(`${expectedMonthStr}T00:00:00`)
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntilStart = Math.round((monthStart - todayStart) / msPerDay)

  if (monthEnd < todayStart) {
    const daysOverdue = Math.round((todayStart - monthEnd) / msPerDay)
    return { status: 'overdue', label: `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}` }
  }
  if (daysUntilStart <= 60) {
    return {
      status: 'soon',
      label: daysUntilStart <= 0 ? 'Due this month' : `Due in ${daysUntilStart} day${daysUntilStart === 1 ? '' : 's'}`,
    }
  }
  return { status: 'normal', label: `Due in ${daysUntilStart} days` }
}
