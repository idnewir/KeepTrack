export function formatCurrency(amount) {
  const value = Number(amount) || 0
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCurrencyCompact(amount) {
  const value = Number(amount) || 0
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

export function formatMonthYear(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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
