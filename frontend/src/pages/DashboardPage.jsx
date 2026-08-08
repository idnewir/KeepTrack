import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FinancialChart from '../components/FinancialChart.jsx'
import HelpIconLink from '../components/HelpIconLink.jsx'
import { InfoTooltip } from '../components/Tooltip.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { useDebtTerminology } from '../context/DebtTerminologyContext.jsx'
import { useBudgetTerminology } from '../context/BudgetTerminologyContext.jsx'
import { useModules } from '../context/ModulesContext.jsx'
import { dashboardApi, notificationsApi } from '../utils/api.js'
import { formatCurrency, formatDate, projectUrgency, singularize } from '../utils/format.js'
import { NOTIFICATION_TOOLTIPS } from '../utils/notificationTooltips.js'

const STATUS_LABEL = { above: 'Above target', near: 'Near target', below: 'Below target' }

// Maps a live dashboard banner's own `type` (routers/dashboard.py's
// DashboardNotification.type) to the `type` its persistent counterpart was
// written under (services/notification_service.py) — used only so
// dismissing a banner here can also dismiss that same underlying
// notification in the header notification centre. invoice_unconfirmed has
// no persistent counterpart (only unsigned invoices are persisted per this
// feature's brief), so it's intentionally absent and just dismisses locally.
// See docs/decisions-log.md.
const PERSISTENT_NOTIFICATION_TYPE = {
  balance_below_target: 'balance_warning',
  invoice_unsigned: 'unsigned_invoice',
  reconciliation_overdue: 'reconciliation_overdue',
  stale_reconciliation: 'stale_reconciliation',
  project_overdue: 'project_overdue',
  critical_errors_detected: 'critical_error',
  audit_log_archived: 'audit_archived',
}

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
    case 'project_overdue':
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
  const debtTerminology = useDebtTerminology()
  const budgetTerminology = useBudgetTerminology()
  const { isEnabled } = useModules()
  const expensesLower = terminology.term_expenses.toLowerCase()
  const projectsLower = terminology.term_projects.toLowerCase()
  // Enabling Debt Tracking switches the dashboard to Personal Finance mode
  // automatically — not a user preference, since the whole point is that
  // net worth/debt figures only exist to show once debts are being tracked
  // at all. See docs/decisions-log.md.
  const personalFinanceMode = isEnabled('debt_tracking')
  const budgetPlanningEnabled = isEnabled('budget_planning')

  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFinancialDetail, setShowFinancialDetail] = useState(false)

  const [notifications, setNotifications] = useState([])
  const [dismissed, setDismissed] = useState(() => new Set())
  // type -> persistent notification id, so dismissing a banner here can also
  // dismiss its underlying row in the header notification centre. See the
  // PERSISTENT_NOTIFICATION_TYPE comment above.
  const [persistentIdByType, setPersistentIdByType] = useState({})

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

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    notificationsApi
      .list({ dismissed: 'false' }, token)
      .then((data) => {
        if (cancelled) return
        const byType = {}
        // First (most recent, since the API orders created_at DESC) row per
        // type wins — create_notification's own dedup means there's at most
        // one still-live row per user/type anyway.
        for (const n of data.notifications) {
          if (!(n.type in byType)) byType[n.type] = n.id
        }
        setPersistentIdByType(byType)
      })
      .catch(() => {
        if (!cancelled) setPersistentIdByType({})
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const dismissNotification = (notification) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(notification.id)
      return next
    })
    const persistentType = PERSISTENT_NOTIFICATION_TYPE[notification.type]
    const persistentId = persistentType ? persistentIdByType[persistentType] : undefined
    if (persistentId !== undefined) {
      notificationsApi.dismiss(persistentId, token).catch(() => {})
    }
  }

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

  // reconciliation_overdue/stale_reconciliation are generated by background
  // logic that keeps running regardless of the module toggle (see
  // docs/decisions-log.md) — filtered out here purely so a disabled module
  // stays out of view, the same as the sidebar link and dashboard panel.
  const RECONCILIATION_NOTIFICATION_TYPES = ['reconciliation_overdue', 'stale_reconciliation']
  const visibleNotifications = notifications.filter(
    (n) => !dismissed.has(n.id) && (isEnabled('reconciliation') || !RECONCILIATION_NOTIFICATION_TYPES.includes(n.type))
  )
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
              <InfoTooltip content={NOTIFICATION_TOOLTIPS[PERSISTENT_NOTIFICATION_TYPE[n.type]]} />
              <div className="kt-notification-actions">
                <Link to={notificationLink(n)} className="kt-notification-view">
                  View <span aria-hidden="true">→</span>
                </Link>
                <button
                  type="button"
                  className="kt-notification-dismiss"
                  aria-label="Dismiss notification"
                  onClick={() => dismissNotification(n)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="kt-page-header">
        <h1 className="kt-page-title">Dashboard</h1>
        <p className="kt-page-subtitle">
          Financial year {summary.financial_year.label} ({summary.financial_year.start_date} to{' '}
          {summary.financial_year.end_date})
        </p>
        <HelpIconLink topic="dashboard-guide" />
      </div>

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

      {personalFinanceMode ? (
        <div className="kt-metric-row">
          <div className={`kt-metric-card kt-metric-balance kt-status-${Number(summary.net_worth) >= 0 ? 'above' : 'below'}`}>
            <span className="kt-metric-label">Net worth</span>
            <span className="kt-metric-value">{formatCurrency(summary.net_worth)}</span>
          </div>
          <div className="kt-metric-card kt-debt-metric-total">
            <span className="kt-metric-label">Total {debtTerminology.debt_term_debt.toLowerCase()}</span>
            <span className="kt-metric-value">{formatCurrency(summary.total_debt)}</span>
          </div>
          <div className="kt-metric-card kt-debt-metric-monthly">
            <span className="kt-metric-label">Monthly payments due</span>
            <span className="kt-metric-value">{formatCurrency(summary.monthly_debt_payments)}</span>
          </div>
          <div className="kt-metric-card">
            <span className="kt-metric-label">Available funds</span>
            <span className="kt-metric-value">{formatCurrency(summary.current_balance)}</span>
          </div>
        </div>
      ) : (
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
      )}

      {personalFinanceMode && (
        <div className="kt-panels-row">
          <DebtSummaryPanel items={summary.debts_summary} debtTerminology={debtTerminology} navigate={navigate} />
          <MonthlyPaymentsDuePanel items={summary.debts_summary} debtTerminology={debtTerminology} />
          <SavingsGoalsPanel
            enabled={budgetPlanningEnabled}
            items={summary.savings_goals}
            budgetTerminology={budgetTerminology}
          />
        </div>
      )}

      <div className="kt-dashboard-panel">
        {personalFinanceMode ? (
          <>
            <button
              type="button"
              className="kt-category-link-button kt-collapsible-toggle"
              onClick={() => setShowFinancialDetail((v) => !v)}
              aria-expanded={showFinancialDetail}
            >
              {showFinancialDetail ? 'Hide financial detail' : 'Show financial detail'}
            </button>
            <div className={`kt-collapsible-chart${showFinancialDetail ? ' expanded' : ''}`}>
              <div>
                <h2 className="kt-panel-title">Financial year at a glance</h2>
                <p className="kt-panel-subtitle">
                  Click a series to see the detail behind it — income, actual spend, or the forecast.
                </p>
                <FinancialChart months={summary.monthly_breakdown} onSeriesClick={handleSeriesClick} />
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="kt-panel-title">Financial year at a glance</h2>
            <p className="kt-panel-subtitle">
              Click a series to see the detail behind it — income, actual spend, or the forecast.
            </p>
            <FinancialChart months={summary.monthly_breakdown} onSeriesClick={handleSeriesClick} />
          </>
        )}
      </div>

      {!personalFinanceMode && (
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
      )}

      {!personalFinanceMode && budgetPlanningEnabled && summary.budget_summary && (
        <BudgetSummaryPanel summary={summary.budget_summary} budgetTerminology={budgetTerminology} />
      )}

      <div className="kt-panels-row">
        <UpcomingInvoicesPanel items={summary.upcoming_expected_invoices} navigate={navigate} expensesLower={expensesLower} />
        {isEnabled('planned_projects') && (
          <PlannedProjectsPanel items={summary.planned_projects} projectsLower={projectsLower} navigate={navigate} />
        )}
        <RecentActivityPanel items={summary.recent_activity} navigate={navigate} expensesLower={expensesLower} />
      </div>
    </div>
  )
}

function DebtSummaryPanel({ items, debtTerminology, navigate }) {
  const termDebt = debtTerminology.debt_term_debt
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">{termDebt} summary</h2>
      <p className="kt-panel-subtitle">
        <Link to="/debts">View all {termDebt.toLowerCase()}s</Link>
      </p>
      {items.length === 0 ? (
        <PanelEmptyState>No active {termDebt.toLowerCase()}s tracked yet.</PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`kt-panel-list-row kt-panel-list-row-clickable${item.promotional_end_date ? ' kt-panel-list-row-promo' : ''}`}
              onClick={() => navigate(`/debts/${item.id}`)}
            >
              <span className="kt-panel-list-main">
                <span>
                  <strong>{item.name}</strong>
                  <span className="kt-panel-list-sub">
                    {Number(item.interest_rate)}% · Next payment {formatDate(item.next_payment_date)}
                    {item.promotional_end_date && (
                      <span className="kt-panel-list-promo-badge"> · Promo ends {formatDate(item.promotional_end_date)}</span>
                    )}
                  </span>
                </span>
              </span>
              <span className="kt-panel-list-amount">{formatCurrency(item.current_balance)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MonthlyPaymentsDuePanel({ items, debtTerminology }) {
  const today = new Date().toISOString().slice(0, 10)
  const currentMonth = today.slice(0, 7)
  const sorted = [...items]
    .filter((item) => item.next_payment_date.slice(0, 7) === currentMonth)
    .sort((a, b) => (a.next_payment_date < b.next_payment_date ? -1 : 1))

  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">{debtTerminology.debt_term_payment}s due this month</h2>
      {sorted.length === 0 ? (
        <PanelEmptyState>No {debtTerminology.debt_term_payment.toLowerCase()}s due this month.</PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {sorted.map((item) => {
            const overdue = item.next_payment_date < today
            return (
              <li key={item.id} className={`kt-panel-list-row${overdue ? ' kt-panel-list-row-overdue' : ''}`}>
                <span className="kt-panel-list-main">
                  <span>
                    <strong>{item.name}</strong>
                    <span className="kt-panel-list-sub">Due {formatDate(item.next_payment_date)}</span>
                  </span>
                </span>
                <span className="kt-panel-list-amount">{formatCurrency(item.current_balance)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SavingsGoalsPanel({ enabled, items, budgetTerminology }) {
  const termGoal = budgetTerminology.budget_term_savings_goal
  return (
    <div className="kt-dashboard-panel kt-panel-card">
      <h2 className="kt-panel-title">{termGoal}s</h2>
      {enabled && <p className="kt-panel-subtitle"><Link to="/budget?tab=savings-goals">View all {termGoal.toLowerCase()}s</Link></p>}
      {!enabled ? (
        <PanelEmptyState>
          {budgetTerminology.budget_term_module} not yet enabled. Enable it in Settings → General → Feature Modules.
        </PanelEmptyState>
      ) : items.length === 0 ? (
        <PanelEmptyState>No active {termGoal.toLowerCase()}s yet.</PanelEmptyState>
      ) : (
        <ul className="kt-panel-list">
          {items.map((item) => {
            const percent = Math.min(100, Math.max(0, Number(item.percent_complete)))
            return (
              <li key={item.id} className="kt-panel-list-row kt-panel-list-row-column">
                <div className="kt-panel-list-row-top">
                  <span className="kt-panel-list-main">
                    <span>
                      <strong>{item.name}</strong>
                      <span className="kt-panel-list-sub">
                        {formatCurrency(item.current_amount)} of {formatCurrency(item.target_amount)} ·{' '}
                        <span className={`kt-savings-goal-track-indicator kt-savings-goal-track-${item.on_track ? 'on' : 'off'}`}>
                          {item.on_track ? '✓ On track' : '⚠ Behind target'}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="kt-panel-list-amount">{percent.toFixed(0)}%</span>
                </div>
                <div className="kt-savings-goal-progress-track kt-panel-list-progress">
                  <div className="kt-savings-goal-progress-fill" style={{ width: `${percent}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function BudgetSummaryPanel({ summary, budgetTerminology }) {
  const termModule = budgetTerminology.budget_term_module
  const statusLabel = { on_track: 'On Track', warning: 'Warning', over_budget: 'Over Budget' }[summary.overall_status]
  const statusLevel = { on_track: 'above', warning: 'near', over_budget: 'below' }[summary.overall_status]
  const percent =
    summary.total_budgeted_ytd > 0
      ? Math.min(100, Math.max(0, (Number(summary.total_actual_ytd) / Number(summary.total_budgeted_ytd)) * 100))
      : 0
  const flagged = [
    ...summary.categories_over_budget.map((c) => ({ ...c, level: 'bad' })),
    ...summary.categories_warning.map((c) => ({ ...c, level: 'amber' })),
  ].slice(0, 3)

  return (
    <div className="kt-dashboard-panel">
      <div className="kt-debt-detail-summary-header">
        <h2 className="kt-panel-title" style={{ margin: 0 }}>{termModule}</h2>
        <span className={`kt-metric-status kt-status-${statusLevel}`}>{statusLabel}</span>
      </div>
      <div className="kt-reserve-gauge">
        <div className="kt-reserve-track">
          <div className={`kt-reserve-fill kt-status-${statusLevel}`} style={{ width: `${percent}%` }} />
        </div>
        <span className="kt-reserve-label">
          Spent {formatCurrency(summary.total_actual_ytd)} / Budgeted {formatCurrency(summary.total_budgeted_ytd)}
        </span>
      </div>
      {flagged.length > 0 && (
        <ul className="kt-panel-list" style={{ marginTop: 12 }}>
          {flagged.map((c) => (
            <li key={c.category_id} className="kt-panel-list-row">
              <span className="kt-panel-list-main">
                <span className="kt-category-swatch" style={{ background: c.category_colour }} aria-hidden="true" />
                <strong>{c.category_name}</strong>
              </span>
              <span className={`kt-budget-status-badge kt-budget-status-badge-${c.level}`}>
                {Number(c.percent_used).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="kt-panel-subtitle" style={{ marginTop: 8 }}>
        <Link to="/budget">View full {termModule.toLowerCase()}</Link>
      </p>
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

function PlannedProjectsPanel({ items, projectsLower, navigate }) {
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
            const overBudget = item.project_status === 'over_budget'
            const progressPct =
              item.estimated_cost > 0 ? Math.min(100, (Number(item.actual_cost) / Number(item.estimated_cost)) * 100) : 0
            return (
              <li
                key={item.id}
                className={`kt-panel-list-row kt-panel-list-row-clickable kt-panel-list-row-column${
                  urgency.status !== 'normal' ? ` kt-project-urgency-${urgency.status}` : ''
                }${overBudget ? ' kt-panel-list-row-over-budget' : ''}`}
                onClick={() => navigate(`/projects/${item.id}`)}
              >
                <div className="kt-panel-list-row-top">
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
                        {overBudget && (
                          <span className="kt-project-urgency-badge kt-project-urgency-badge-overdue" style={{ marginLeft: 8 }}>
                            Over budget
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="kt-panel-list-amount">
                    {formatCurrency(item.actual_cost)} / {formatCurrency(item.estimated_cost)}
                  </span>
                </div>
                {item.invoice_count > 0 && (
                  <div className="kt-project-progress-track kt-panel-list-progress">
                    <div
                      className={`kt-project-progress-fill kt-project-variance-${overBudget ? 'over' : 'under'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                )}
                {item.is_funding_target && item.funding_target_amount != null && (
                  <FundingProgressRow item={item} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Savings progress toward a "saving toward this project" funding target —
// current_balance/monthly_surplus_needed/on_track are all computed live by
// services/project_service.funding_progress against the app's overall
// balance and recent income/spend trend, not this project's own actual
// spend (a different question — see docs/decisions-log.md).
function FundingProgressRow({ item }) {
  const target = Number(item.funding_target_amount)
  const balance = item.current_balance != null ? Number(item.current_balance) : null
  const savedPct = target > 0 && balance != null ? Math.min(100, Math.max(0, (balance / target) * 100)) : 0

  return (
    <div className="kt-project-funding">
      <div className="kt-project-funding-row">
        <span>
          Saving toward: <strong>{formatCurrency(item.funding_target_amount)}</strong>
          {item.funding_target_date && <> by {formatDate(item.funding_target_date)}</>}
        </span>
        {item.on_track != null && (
          <span className={`kt-funding-track-indicator kt-funding-track-${item.on_track ? 'on' : 'off'}`}>
            {item.on_track ? '✓ On track' : '⚠ Behind target'}
          </span>
        )}
      </div>
      <div className="kt-project-progress-track kt-panel-list-progress">
        <div
          className={`kt-project-progress-fill kt-funding-track-${item.on_track ? 'on-fill' : 'off-fill'}`}
          style={{ width: `${savedPct}%` }}
        />
      </div>
      {item.monthly_surplus_needed != null && (
        <span className="kt-project-funding-surplus">
          Monthly surplus needed: {formatCurrency(item.monthly_surplus_needed)}/month
        </span>
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
