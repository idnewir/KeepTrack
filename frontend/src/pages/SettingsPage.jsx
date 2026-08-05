import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { settingsApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'
import { formatMonthYear, MONTH_NAMES } from '../utils/format.js'

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function SettingsPage() {
  const { user } = useAuth()
  const token = user?.token

  const [signingEnabled, setSigningEnabled] = useState(null)
  const [appStartDate, setAppStartDate] = useState(null) // 'YYYY-MM-DD' or null
  const [appStartMonthInput, setAppStartMonthInput] = useState(currentMonthValue)
  const [fyStartMonth, setFyStartMonth] = useState(9) // 1-12, current saved value
  const [fyStartMonthInput, setFyStartMonthInput] = useState(9) // dropdown selection
  const [fyStartMonthStep, setFyStartMonthStep] = useState('idle') // 'idle' | 'confirm'
  const [savingFyStartMonth, setSavingFyStartMonth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAppStartDate, setSavingAppStartDate] = useState(false)
  const [error, setError] = useState('')

  const loadSettings = () => {
    setLoading(true)
    setError('')
    return settingsApi
      .list(token)
      .then((rows) => {
        const signing = rows.find((row) => row.key === 'signing_enabled')
        setSigningEnabled(signing ? signing.value === 'true' : true)

        const startDate = rows.find((row) => row.key === 'app_start_date')
        setAppStartDate(startDate?.value || null)
        setAppStartMonthInput(startDate?.value ? startDate.value.slice(0, 7) : currentMonthValue())

        const fyMonth = rows.find((row) => row.key === 'financial_year_start_month')
        const fyMonthValue = fyMonth?.value ? Number(fyMonth.value) : 9
        setFyStartMonth(fyMonthValue)
        setFyStartMonthInput(fyMonthValue)
      })
      .catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleToggleSigning = async () => {
    const next = !signingEnabled
    setError('')
    setSaving(true)
    try {
      await settingsApi.update('signing_enabled', next ? 'true' : 'false', token)
      setSigningEnabled(next)
    } catch (err) {
      setError(err.message || 'Failed to update setting')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAppStartDate = async () => {
    if (!appStartMonthInput) return
    setError('')
    setSavingAppStartDate(true)
    try {
      const updated = await settingsApi.update('app_start_date', `${appStartMonthInput}-01`, token)
      setAppStartDate(updated.value)
    } catch (err) {
      setError(err.message || 'Failed to save app start date')
    } finally {
      setSavingAppStartDate(false)
    }
  }

  const handleClearAppStartDate = async () => {
    setError('')
    setSavingAppStartDate(true)
    try {
      await settingsApi.clear('app_start_date', token)
      setAppStartDate(null)
    } catch (err) {
      setError(err.message || 'Failed to clear app start date')
    } finally {
      setSavingAppStartDate(false)
    }
  }

  const handleRequestSaveFyStartMonth = () => {
    if (fyStartMonthInput === fyStartMonth) return
    setFyStartMonthStep('confirm')
  }

  const handleConfirmSaveFyStartMonth = async () => {
    setError('')
    setSavingFyStartMonth(true)
    try {
      await settingsApi.update('financial_year_start_month', String(fyStartMonthInput), token)
      setFyStartMonth(fyStartMonthInput)
      setFyStartMonthStep('idle')
    } catch (err) {
      setError(err.message || 'Failed to save financial year start month')
    } finally {
      setSavingFyStartMonth(false)
    }
  }

  const handleCancelSaveFyStartMonth = () => {
    setFyStartMonthInput(fyStartMonth)
    setFyStartMonthStep('idle')
  }

  return (
    <div>
      <h1 className="kt-page-title">Settings</h1>
      <p className="kt-page-subtitle">Configure how Keep Track behaves for everyone.</p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <h2 className="kt-panel-title">General</h2>
      <div className="kt-settings-list" style={{ marginBottom: 32 }}>
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">App start date</span>
            <p className="kt-settings-row-description">
              Months before this date are hidden across the app. Useful if you started mid-year
              or are importing historical data.
            </p>
            <p className="kt-settings-row-description">
              {loading
                ? ''
                : appStartDate
                  ? `Currently set to ${formatMonthYear(appStartDate)}.`
                  : 'Not set — all months are shown.'}
            </p>
          </div>
          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <div className="kt-settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="month"
                value={appStartMonthInput}
                onChange={(e) => setAppStartMonthInput(e.target.value)}
                disabled={savingAppStartDate}
              />
              <button
                type="button"
                className="kt-category-link-button"
                onClick={handleSaveAppStartDate}
                disabled={savingAppStartDate || !appStartMonthInput}
              >
                {savingAppStartDate ? 'Saving…' : 'Save'}
              </button>
              {appStartDate && (
                <button
                  type="button"
                  className="kt-category-link-button kt-category-danger"
                  onClick={handleClearAppStartDate}
                  disabled={savingAppStartDate}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Financial year start month</span>
            <p className="kt-settings-row-description">
              The month your financial year begins. Keep Track will organise all data around
              this date.
            </p>
            {fyStartMonthStep === 'confirm' && (
              <p className="kt-opening-balance-prompt" style={{ marginTop: 8 }}>
                <strong>
                  Changing the financial year start month will affect how all historical data is
                  grouped and displayed. Existing financial year records will not be changed
                  automatically.
                </strong>
              </p>
            )}
          </div>
          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <div className="kt-settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {fyStartMonthStep === 'confirm' ? (
                <>
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={handleConfirmSaveFyStartMonth}
                    disabled={savingFyStartMonth}
                  >
                    {savingFyStartMonth ? 'Saving…' : 'Confirm change'}
                  </button>
                  <button
                    type="button"
                    className="kt-category-link-button kt-category-danger"
                    onClick={handleCancelSaveFyStartMonth}
                    disabled={savingFyStartMonth}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <select
                    value={fyStartMonthInput}
                    onChange={(e) => setFyStartMonthInput(Number(e.target.value))}
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={name} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={handleRequestSaveFyStartMonth}
                    disabled={fyStartMonthInput === fyStartMonth}
                  >
                    Save
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="kt-settings-list">
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Signing and export</span>
            <p className="kt-settings-row-description">
              When enabled, users will be asked to sign and date invoices before confirming
              them. Turn this off for personal use cases where signing is not required.
            </p>
          </div>
          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(signingEnabled)}
              className={`kt-toggle${signingEnabled ? ' on' : ''}`}
              onClick={handleToggleSigning}
              disabled={saving}
            >
              <span className="kt-toggle-track">
                <span className="kt-toggle-thumb" />
              </span>
              <span className="kt-toggle-label">{signingEnabled ? 'On' : 'Off'}</span>
            </button>
          )}
        </div>

        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Categories</span>
            <p className="kt-settings-row-description">
              Add, rename, recolour, or deactivate the categories used to classify invoices.
            </p>
          </div>
          <Link to="/settings/categories" className="kt-auth-button kt-settings-link-button">
            Manage categories
          </Link>
        </div>
      </div>
    </div>
  )
}
