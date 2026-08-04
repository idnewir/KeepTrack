export function formatCurrency(amount) {
  const value = Number(amount) || 0
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCurrencyCompact(amount) {
  const value = Number(amount) || 0
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}
