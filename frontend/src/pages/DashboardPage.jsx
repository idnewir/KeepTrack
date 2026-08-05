import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FinancialChart from '../components/FinancialChart.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { dashboardApi } from '../utils/api.js'
import { formatCurrency, projectUrgency, singularize } from '../utils/format.js'

const STATUS_LABEL = { above: 'Above target', near: 'Near target', below: 'Below target' }

// The backend's own `link` field predates the dashboard notification-links
// task and still points at plain query filters (e.g. reviewed=true) or the
// dashboard itself for the balance warning. Mapping by notification `type`
// here sends each one to the specific pre-filtered view the task calls for,
// without needing a backend change.
function notificationLink(notification) {
  switch (notification.type) {
    case 'invoice_unconfirmed':
      return '/invoices?filter=unreviewed'
    case 'invoice_unsigned':
      return '/invoices?filter=unsigned'
    case 'balance_below_target':
      return '/reconciliation'
    case 'planned_project_overdue':
      return '/projects'
    case 'critical_errors_detected':
    case 'audit_log_archived':
      return notification.link || '/settings?section=logs'
    default:
      return notification.link || '/'
  }
}

export default function DashboardPage() {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const terminology = useTerminology()
  const expensesLower = terminology.term_expenses.toLowerCase()
  const projectsLower = terminology.term_projects.toLowerCase()

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
      {summary.financial_year.opening_balance == null && (
        <div className="kt-opening-balance-panel" style={{ marginBottom: 24 }}>
          <div className="kt-opening-balance-prompt">
            <div>
              <strong>No opening balance set for {summary.financial_year.label}.</strong>
              <p>
                Balances and reconciliation for this financial year won't be accurate until an
                opening balance is set.
              </p>
            </div>
            {(user?.role === 'admin' || user?.role === 'superadmin') && (
              <Link to="/contributions" className="kt-auth-button">
                Set opening balance
              </Link>
            )}
          </div>
        </div>
      )}

      {visibleNotifications.length > 0 && (
        <div className="kt-notifications">
          {visibleNotifications.map((n) => (
            <div key={n.id} className={`kt-notification kt-notification-${n.severity}`}>
              <span className="kt-notification-message">{n.message}</span>
              <div className="kt-notification-actions">
                <Link to={notificationLink(n)} className="kt-notification-view">
                  View <span aria-hidden="true">→</span>
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
            + Upload {singularize(expensesLower)}
          </Link>
          <Link to="/contributions" className="kt-auth-button kt-quick-action-button kt-quick-action-secondary">
            + Record {singularize(terminology.term_income).toLowerCase()}
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
        <h2 className="kt-panel-title">{summary.reserve_label}</h2>
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
        <p className="kt-panel-subtitle" style={{ marginTop: 8 }}>
          {summary.reserve_calculation === 'manual'
            ? 'Manually set target'
            : `Based on ${summary.reserve_months} month${summary.reserve_months === 1 ? '' : 's'} of average expenses`}
        </p>
      </div>

      <div className="kt-panels-row">
        <UpcomingInvoicesPanel items={summary.upcoming_expected_invoices} navigate={navigate} expensesLower={expensesLower} />
        <PlannedProjectsPanel items={summary.planned_projects} projectsLower={projectsLower} />
        <RecentActivityPanel items={summary.recent_activity} navigate={navigate} expensesLower={expensesLower} />
      </div>
    </div>
  )
}

function PanelEmptyState({ children }) {
  return <div className="kt-panel-empty">{children}</div>
}

function UpcomingInvoicesPanel({ items, navigate, expensesLower }) {
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">Upcoming expected {expensesLower}</h2>
      <p className="kt-panel-subtitle">Based on suppliers seen in the last 3 months.</p>
      {items.length === 0 ? (
        <PanelEmptyState>
          No repeat suppliers yet — this fills in once a few months of {expensesLower} are on file.
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

function PlannedProjectsPanel({ items, projectsLower }) {
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">Planned {projectsLower}</h2>
      <p className="kt-panel-subtitle">
        <Link to="/projects">Manage {projectsLower}</Link>
      </p>
      {items.length === 0 ? (
        <PanelEmptyState>No planned {projectsLower} logged yet.</PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {items.map((item) => {
            const urgency = projectUrgency(item.expected_month)
            return (
              <li
                key={item.id}
                className={`kt-panel-list-row${urgency.status !== 'normal' ? ` kt-project-urgency-${urgency.status}` : ''}`}
              >
                <span className="kt-panel-list-main">
                  <span className="kt-category-swatch" style={{ background: '#7C5CBF' }} aria-hidden="true" />
                  <span>
                    <strong>{item.name}</strong>
                    <span className="kt-panel-list-sub">
                      Expected {item.expected_month_label}
                      {urgency.status !== 'normal' && (
                        <span className={`kt-project-urgency-badge kt-project-urgency-badge-${urgency.status}`} style={{ marginLeft: 8 }}>
                          {urgency.label}
                        </span>
                      )}
                    </span>
                  </span>
                </span>
                <span className="kt-panel-list-amount">{formatCurrency(item.estimated_cost)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function RecentActivityPanel({ items, navigate, expensesLower }) {
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">Recent activity</h2>
      <p className="kt-panel-subtitle">The last 5 {expensesLower} confirmed.</p>
      {items.length === 0 ? (
        <PanelEmptyState>No confirmed {expensesLower} yet.</PanelEmptyState>
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
