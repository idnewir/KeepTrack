import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/AuthContext.jsx'
import { useModules } from '../../context/ModulesContext.jsx'
import { usePaginationState, perPageParam } from '../../hooks/usePaginationState.js'
import { settingsApi, notificationsApi, triggerBlobDownload } from '../../utils/api.js'
import { formatDateTime } from '../../utils/format.js'
import PaginationBar from '../PaginationBar.jsx'

// Matches services/settings_service.py's NOTIF_PREFERENCE_DEFAULTS — key,
// what it's called, and when it fires. `module` (if set) hides the row
// entirely unless that feature module is enabled, per the task brief.
const PREFERENCE_ITEMS = [
  {
    key: 'notif_balance_warning',
    label: 'Balance warning',
    description: 'Alert when your balance falls below the target reserve',
  },
  {
    key: 'notif_unsigned_invoice',
    label: 'Unsigned invoices',
    description: 'Alert when confirmed invoices have not been signed',
  },
  {
    key: 'notif_stale_reconciliation',
    label: 'Stale reconciliation',
    description: 'Alert when a reconciled month has new data added to it',
  },
  {
    key: 'notif_reconciliation_overdue',
    label: 'Reconciliation overdue',
    description: 'Alert when a month has not been reconciled within the configured number of days',
  },
  {
    key: 'notif_critical_error',
    label: 'Critical system errors',
    description: 'Alert when a critical error occurs in the system',
  },
  {
    key: 'notif_project_overdue',
    label: 'Overdue projects',
    description: 'Alert when a planned project passes its expected date',
  },
  {
    key: 'notif_promo_rate_expiring',
    label: 'Promotional rate expiring',
    description: 'Alert when a promotional interest rate is about to expire',
    module: 'debt_tracking',
  },
  {
    key: 'notif_budget_warning',
    label: 'Budget warning',
    description: 'Alert when a budget category reaches the warning threshold',
    module: 'budget_planning',
  },
  {
    key: 'notif_budget_over',
    label: 'Over budget',
    description: 'Alert when a budget category exceeds its budget',
    module: 'budget_planning',
  },
  {
    key: 'notif_debt_milestone',
    label: 'Debt milestones',
    description: 'Alert when a debt reaches 25%, 50%, 75%, or 100% paid off',
    module: 'debt_tracking',
  },
]

// Matches services/settings_service.py's NOTIF_THRESHOLD_DEFAULTS — the
// `options` order matches the dropdowns specified in the task brief, with
// `default` used only to label which option is the out-of-the-box value.
const THRESHOLD_ITEMS = [
  {
    key: 'notif_reconciliation_overdue_days',
    label: 'Reconciliation overdue after',
    description: 'How many days after a month ends before it is flagged as overdue for reconciliation',
    options: ['7', '14', '30', '60', '90'],
    default: '30',
    unit: 'days',
  },
  {
    key: 'notif_promo_rate_warning_days',
    label: 'Promotional rate warning',
    description: 'How many days before a promotional rate expires to send a warning',
    options: ['7', '14', '30', '60'],
    default: '30',
    unit: 'days',
  },
  {
    key: 'notif_unconfirmed_invoice_days',
    label: 'Unconfirmed invoice warning after',
    description: 'How many days an invoice can remain unreviewed before triggering a warning',
    options: ['1', '3', '7', '14'],
    default: '3',
    unit: 'days',
  },
  {
    key: 'notif_budget_warning_percent',
    label: 'Budget warning threshold',
    description: 'How much of a budget must be used before sending a warning notification',
    options: ['70', '75', '80', '85', '90'],
    default: '80',
    unit: '%',
    module: 'budget_planning',
  },
]

function optionLabel(value, unit, isDefault) {
  const text = unit === '%' ? `${value}%` : `${value} ${unit}`
  return isDefault ? `${text} (default)` : text
}

export default function NotificationSettings({ token }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { isEnabled } = useModules()
  const debtTrackingEnabled = isEnabled('debt_tracking')
  const budgetPlanningEnabled = isEnabled('budget_planning')

  const [values, setValues] = useState({}) // key -> string value, as saved
  const [draftPrefs, setDraftPrefs] = useState({})
  const [draftThresholds, setDraftThresholds] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [thresholdsSaved, setThresholdsSaved] = useState(false)

  const moduleEnabled = { debt_tracking: debtTrackingEnabled, budget_planning: budgetPlanningEnabled }
  const visiblePreferences = useMemo(
    () => PREFERENCE_ITEMS.filter((item) => !item.module || moduleEnabled[item.module]),
    [debtTrackingEnabled, budgetPlanningEnabled]
  )
  const visibleThresholds = useMemo(
    () => THRESHOLD_ITEMS.filter((item) => !item.module || moduleEnabled[item.module]),
    [debtTrackingEnabled, budgetPlanningEnabled]
  )

  const loadSettings = () => {
    setLoading(true)
    setError('')
    return settingsApi
      .list(token)
      .then((rows) => {
        const map = {}
        rows.forEach((row) => {
          if (row.key.startsWith('notif_')) map[row.key] = row.value
        })
        setValues(map)
        const prefs = {}
        PREFERENCE_ITEMS.forEach((item) => {
          prefs[item.key] = (map[item.key] ?? 'true').toLowerCase() !== 'false'
        })
        setDraftPrefs(prefs)
        const thresholds = {}
        THRESHOLD_ITEMS.forEach((item) => {
          thresholds[item.key] = map[item.key] ?? item.default
        })
        setDraftThresholds(thresholds)
      })
      .catch((err) => setError(err.message || 'Failed to load notification settings'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const prefsDirty = PREFERENCE_ITEMS.some(
    (item) => draftPrefs[item.key] !== ((values[item.key] ?? 'true').toLowerCase() !== 'false')
  )
  const thresholdsDirty = THRESHOLD_ITEMS.some(
    (item) => draftThresholds[item.key] !== (values[item.key] ?? item.default)
  )

  const handleSavePreferences = async () => {
    setSavingPrefs(true)
    setError('')
    setPrefsSaved(false)
    try {
      await Promise.all(
        PREFERENCE_ITEMS.filter(
          (item) => draftPrefs[item.key] !== ((values[item.key] ?? 'true').toLowerCase() !== 'false')
        ).map((item) => settingsApi.update(item.key, draftPrefs[item.key] ? 'true' : 'false', token))
      )
      await loadSettings()
      setPrefsSaved(true)
    } catch (err) {
      setError(err.message || 'Failed to save notification preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleSaveThresholds = async () => {
    setSavingThresholds(true)
    setError('')
    setThresholdsSaved(false)
    try {
      await Promise.all(
        THRESHOLD_ITEMS.filter((item) => draftThresholds[item.key] !== (values[item.key] ?? item.default)).map(
          (item) => settingsApi.update(item.key, draftThresholds[item.key], token)
        )
      )
      await loadSettings()
      setThresholdsSaved(true)
    } catch (err) {
      setError(err.message || 'Failed to save notification thresholds')
    } finally {
      setSavingThresholds(false)
    }
  }

  if (loading) return <p className="kt-page-subtitle">Loading…</p>

  return (
    <div>
      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {!isAdmin && (
        <div className="kt-settings-info-box" style={{ marginBottom: 20 }}>
          Contact your Administrator to change notification settings.
        </div>
      )}

      <h3 className="kt-panel-title" style={{ fontSize: 16 }}>
        Notification preferences
      </h3>
      <p className="kt-panel-subtitle">
        Choose which notifications you receive. Turning off a notification type means you will not
        be alerted when that condition occurs.
      </p>

      <div className="kt-settings-list" style={{ marginBottom: isAdmin ? 12 : 32 }}>
        {visiblePreferences.map((item) => (
          <div className="kt-settings-row" key={item.key}>
            <div className="kt-settings-row-text">
              <span className="kt-settings-row-title">{item.label}</span>
              <p className="kt-settings-row-description">{item.description}</p>
            </div>
            <div className="kt-settings-row-control">
              {isAdmin ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={draftPrefs[item.key]}
                  aria-label={`${draftPrefs[item.key] ? 'Disable' : 'Enable'} ${item.label}`}
                  className={`kt-toggle${draftPrefs[item.key] ? ' on' : ''}`}
                  onClick={() =>
                    setDraftPrefs((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                  }
                >
                  <span className="kt-toggle-track">
                    <span className="kt-toggle-thumb" />
                  </span>
                </button>
              ) : (
                <span className="kt-status-badge">{draftPrefs[item.key] ? 'On' : 'Off'}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="kt-auth-button"
            style={{ width: 'auto', marginTop: 0, padding: '9px 18px' }}
            onClick={handleSavePreferences}
            disabled={!prefsDirty || savingPrefs}
          >
            {savingPrefs ? 'Saving…' : 'Save preferences'}
          </button>
          {prefsSaved && !prefsDirty && <span className="kt-profile-success">Saved</span>}
        </div>
      )}

      <h3 className="kt-panel-title" style={{ fontSize: 16 }}>
        Notification thresholds
      </h3>
      <p className="kt-panel-subtitle">Configure when certain notifications are triggered.</p>

      <div className="kt-settings-list" style={{ marginBottom: isAdmin ? 12 : 32 }}>
        {visibleThresholds.map((item) => (
          <div className="kt-settings-row" key={item.key}>
            <div className="kt-settings-row-text">
              <span className="kt-settings-row-title">{item.label}</span>
              <p className="kt-settings-row-description">{item.description}</p>
            </div>
            <div className="kt-settings-row-control">
              {isAdmin ? (
                <select
                  value={draftThresholds[item.key]}
                  onChange={(e) =>
                    setDraftThresholds((prev) => ({ ...prev, [item.key]: e.target.value }))
                  }
                >
                  {item.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {optionLabel(opt, item.unit, opt === item.default)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="kt-status-badge">
                  {optionLabel(draftThresholds[item.key], item.unit, draftThresholds[item.key] === item.default)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="kt-auth-button"
            style={{ width: 'auto', marginTop: 0, padding: '9px 18px' }}
            onClick={handleSaveThresholds}
            disabled={!thresholdsDirty || savingThresholds}
          >
            {savingThresholds ? 'Saving…' : 'Save thresholds'}
          </button>
          {thresholdsSaved && !thresholdsDirty && <span className="kt-profile-success">Saved</span>}
        </div>
      )}

      {isAdmin && <NotificationHistory token={token} />}
    </div>
  )
}

function NotificationHistory({ token }) {
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clearing, setClearing] = useState(false)

  const { page, perPage, setPage, setPerPage } = usePaginationState('notification-history')

  const loadHistory = () => {
    setLoading(true)
    setError('')
    return notificationsApi
      .history({ page, perPage: perPageParam(perPage) }, token)
      .then((res) => {
        setRows(res.data)
        setPagination(res.pagination)
      })
      .catch((err) => setError(err.message || 'Failed to load notification history'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, token])

  const handleExportCsv = async () => {
    const blob = await notificationsApi.historyExportCsv(token)
    triggerBlobDownload(blob, 'notification_history.csv')
  }

  const handleClearDismissed = async () => {
    setClearing(true)
    setError('')
    try {
      await notificationsApi.dismissAll(token)
      await loadHistory()
    } catch (err) {
      setError(err.message || 'Failed to clear dismissed notifications')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      <h3 className="kt-panel-title" style={{ fontSize: 16 }}>
        Notification history
      </h3>
      <p className="kt-panel-subtitle">
        All notifications sent in the last 30 days, including dismissed ones.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="kt-category-link-button"
          onClick={handleClearDismissed}
          disabled={clearing}
        >
          {clearing ? 'Clearing…' : 'Clear all dismissed'}
        </button>
      </div>

      {loading ? (
        <p className="kt-page-subtitle">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="kt-settings-coming-soon">No notifications in the last 30 days.</div>
      ) : (
        <div className="kt-table-scroll">
          <table className="kt-users-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className={n.dismissed ? 'kt-notification-history-dismissed' : ''}>
                  <td>{formatDateTime(n.created_at)}</td>
                  <td>{n.type}</td>
                  <td>
                    <span className={`kt-severity-badge kt-severity-${n.severity}`}>{n.severity}</span>
                  </td>
                  <td>{n.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        pagination={pagination}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        onExportCsv={handleExportCsv}
        disabled={loading}
      />
    </div>
  )
}
