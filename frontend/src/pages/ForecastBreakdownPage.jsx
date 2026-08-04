import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { dashboardApi } from '../utils/api.js'
import { formatCurrency } from '../utils/format.js'

export default function ForecastBreakdownPage() {
  const { user } = useAuth()
  const token = user?.token

  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    dashboardApi
      .summary(token)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load the forecast')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div>
      <Link to="/" className="kt-category-link-button">
        ← Back to Dashboard
      </Link>
      <h1 className="kt-page-title">Forecast breakdown</h1>
      <p className="kt-page-subtitle">
        Projected spend for the rest of {summary?.financial_year?.label || 'the financial year'}, by category —
        each based on the average monthly spend for that category over the last 3 months, plus any planned
        project costs due in that time.
      </p>

      {loading && <p className="kt-page-subtitle">Loading…</p>}
      {error && <div className="kt-auth-error">{error}</div>}

      {summary && (
        <>
          {summary.forecast_by_category.length === 0 ? (
            <div className="kt-categories-empty">
              Not enough invoice history yet to forecast — this fills in once a few months of confirmed invoices
              are on file.
            </div>
          ) : (
            <table className="kt-invoices-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Average monthly spend</th>
                  <th>Remaining months</th>
                  <th>Projected total</th>
                </tr>
              </thead>
              <tbody>
                {summary.forecast_by_category.map((row) => (
                  <tr key={row.category_id ?? 'uncategorised'}>
                    <td>
                      <span className="kt-invoice-category">
                        {row.category_colour && (
                          <span
                            className="kt-category-swatch"
                            style={{ background: row.category_colour }}
                            aria-hidden="true"
                          />
                        )}
                        {row.category_name}
                      </span>
                    </td>
                    <td>{formatCurrency(row.monthly_average)}</td>
                    <td>{row.remaining_months}</td>
                    <td>{formatCurrency(row.remaining_months_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="kt-dashboard-panel" style={{ marginTop: 24 }}>
            <h2 className="kt-panel-title">Planned projects included in this forecast</h2>
            {summary.planned_projects.length === 0 ? (
              <div className="kt-categories-empty">No planned projects logged yet.</div>
            ) : (
              <ul className="kt-panel-list">
                {summary.planned_projects.map((p) => (
                  <li key={p.id} className="kt-panel-list-row">
                    <span className="kt-panel-list-main">
                      <span>
                        <strong>{p.name}</strong>
                        <span className="kt-panel-list-sub">Expected {p.expected_month_label}</span>
                      </span>
                    </span>
                    <span className="kt-panel-list-amount">{formatCurrency(p.estimated_cost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
