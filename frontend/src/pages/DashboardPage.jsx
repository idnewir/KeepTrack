import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FinancialChart from '../components/FinancialChart.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { dashboardApi } from '../utils/api.js'
import { formatCurrency } from '../utils/format.js'

const STATUS_LABEL = { above: 'Above target', near: 'Near target', below: 'Below target' }

export default function DashboardPage() {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()

  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [notifications, setNotifications] = useState([])
  const [dismissed, setDismissed] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    dashboardApi
      .summary(token)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load the dashboard')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    dashboardApi
      .notifications(token)
      .then((data) => {
        if (!cancelled) setNotifications(data)
      })
      .catch(() => {
        if (!cancelled) setNotifications([])
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const dismissNotification = (id) =>
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

  const handleSeriesClick = useCallback(
    (series) => {
      if (!summary) return
      if (series === 'income') {
        navigate('/contributions')
      } else if (series === 'spend') {
        const { start_date, end_date } = summary.financial_year
        navigate(`/invoices?dateFrom=${start_date}&dateTo=${end_date}`)
      } else if (series === 'forecast') {
        navigate('/forecast')
      }
    },
    [summary, navigate]
  )

  if (loading) {
    return <p className="kt-page-subtitle">Loading dashboard…</p>
  }

  if (error) {
    return <div className="kt-auth-error">{error}</div>
  }

  if (!summary) return null

  const visibleNotifications = notifications.filter((n) => !dismissed.has(n.id))
  const reservePct =
    summary.target_reserve > 0
      ? Math.min(Math.max(summary.current_balance / summary.target_reserve, 0), 1) * 100
      : summary.current_balance >= 0
        ? 100
        : 0

  return (
    <div className="kt-dashboard">
      {visibleNotifications.length > 0 && (
        <div className="kt-notifications">
          {visibleNotifications.map((n) => (
            <div key={n.id} className={`kt-notification kt-notification-${n.severity}`}>
              <Link to={n.link || '/'} className="kt-notification-message">
                {n.message}
              </Link>
              <button
                type="button"
                className="kt-notification-dismiss"
                aria-label="Dismiss notification"
                onClick={() => dismissNotification(n.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <h1 className="kt-page-title">Dashboard</h1>
      <p className="kt-page-subtitle">
        Financial year {summary.financial_year.label} ({summary.financial_year.start_date} to{' '}
        {summary.financial_year.end_date})
      </p>

      {user?.role !== 'readonly' && (
        <div className="kt-quick-actions">
          <Link to="/upload" className="kt-auth-button kt-quick-action-button">
            + Upload invoice
          </Link>
          <Link to="/contributions" className="kt-auth-button kt-quick-action-button kt-quick-action-secondary">
            + Record contribution
          </Link>
          <Link to="/reports" className="kt-auth-button kt-quick-action-button kt-quick-action-secondary">
            Run report
          </Link>
        </div>
      )}

      <div className="kt-metric-row">
        <div className="kt-metric-card">
          <span className="kt-metric-label">Monthly average cost</span>
          <span className="kt-metric-value">{formatCurrency(summary.monthly_average_cost)}</span>
        </div>
        <div className="kt-metric-card">
          <span className="kt-metric-label">Total spent this year</span>
          <span className="kt-metric-value">{formatCurrency(summary.total_spent)}</span>
        </div>
        <div className="kt-metric-card">
          <span className="kt-metric-label">Total income this year</span>
          <span className="kt-metric-value">{formatCurrency(summary.total_contributions)}</span>
        </div>
        <div className={`kt-metric-card kt-metric-balance kt-status-${summary.balance_status}`}>
          <span className="kt-metric-label">Current balance</span>
          <span className="kt-metric-value">{formatCurrency(summary.current_balance)}</span>
          <span className="kt-metric-status">{STATUS_LABEL[summary.balance_status]}</span>
        </div>
      </div>

      <div className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Financial year at a glance</h2>
        <p className="kt-panel-subtitle">
          Click a series to see the detail behind it — income, actual spend, or the forecast.
        </p>
        <FinancialChart months={summary.monthly_breakdown} onSeriesClick={handleSeriesClick} />
      </div>

      <div className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Target reserve</h2>
        <div className="kt-reserve-gauge">
          <div className="kt-reserve-track">
            <div
              className={`kt-reserve-fill kt-status-${summary.balance_status}`}
              style={{ width: `${reservePct}%` }}
            />
          </div>
          <span className="kt-reserve-label">
            Balance {formatCurrency(summary.current_balance)} / Target {formatCurrency(summary.target_reserve)}
          </span>
        </div>
      </div>

      <div className="kt-panels-row">
        <UpcomingInvoicesPanel items={summary.upcoming_expected_invoices} navigate={navigate} />
        <PlannedProjectsPanel items={summary.planned_projects} />
        <RecentActivityPanel items={summary.recent_activity} navigate={navigate} />
      </div>
    </div>
  )
}

function PanelEmptyState({ children }) {
  return <div className="kt-panel-empty">{children}</div>
}

function UpcomingInvoicesPanel({ items, navigate }) {
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">Upcoming expected invoices</h2>
      <p className="kt-panel-subtitle">Based on suppliers seen in the last 3 months.</p>
      {items.length === 0 ? (
        <PanelEmptyState>
          No repeat suppliers yet — this fills in once a few months of invoices are on file.
        </PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {items.map((item) => (
            <li
              key={item.supplier}
              className={`kt-panel-list-row${item.category_id ? ' kt-panel-list-row-clickable' : ''}`}
              onClick={item.category_id ? () => navigate(`/invoices?categoryId=${item.category_id}`) : undefined}
            >
              <span className="kt-panel-list-main">
                {item.category_colour && (
                  <span className="kt-category-swatch" style={{ background: item.category_colour }} aria-hidden="true" />
                )}
                <span>
                  <strong>{item.supplier}</strong>
                  <span className="kt-panel-list-sub">Expected around {item.expected_around}</span>
                </span>
              </span>
              <span className="kt-panel-list-amount">{formatCurrency(item.estimated_amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PlannedProjectsPanel({ items }) {
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">Planned projects</h2>
      <p className="kt-panel-subtitle">
        <Link to="/projects">Manage projects</Link>
      </p>
      {items.length === 0 ? (
        <PanelEmptyState>No planned projects logged yet.</PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {items.map((item) => (
            <li key={item.id} className="kt-panel-list-row">
              <span className="kt-panel-list-main">
                <span className="kt-category-swatch" style={{ background: '#7C5CBF' }} aria-hidden="true" />
                <span>
                  <strong>{item.name}</strong>
                  <span className="kt-panel-list-sub">Expected {item.expected_month_label}</span>
                </span>
              </span>
              <span className="kt-panel-list-amount">{formatCurrency(item.estimated_cost)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecentActivityPanel({ items, navigate }) {
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">Recent activity</h2>
      <p className="kt-panel-subtitle">The last 5 invoices confirmed.</p>
      {items.length === 0 ? (
        <PanelEmptyState>No confirmed invoices yet.</PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="kt-panel-list-row kt-panel-list-row-clickable"
              onClick={() => navigate(`/invoices/${item.id}`)}
            >
              <span className="kt-panel-list-main">
                {item.category_colour && (
                  <span className="kt-category-swatch" style={{ background: item.category_colour }} aria-hidden="true" />
                )}
                <span>
                  <strong>{item.supplier || <em>Unknown supplier</em>}</strong>
                  <span className="kt-panel-list-sub">{item.invoice_date}</span>
                </span>
              </span>
              <span className="kt-panel-list-amount">{formatCurrency(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
