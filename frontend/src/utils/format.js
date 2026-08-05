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
