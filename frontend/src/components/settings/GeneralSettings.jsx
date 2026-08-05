import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { settingsApi } from '../../utils/api.js'
import { useTerminology } from '../../context/TerminologyContext.jsx'
import { formatMonthYear, MONTH_NAMES } from '../../utils/format.js'

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const RESERVE_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function GeneralSettings({ token }) {
  const terminology = useTerminology()

  const [appStartDate, setAppStartDate] = useState(null) // 'YYYY-MM-DD' or null
  const [appStartMonthInput, setAppStartMonthInput] = useState(currentMonthValue)
  const [fyStartMonth, setFyStartMonth] = useState(9)
  const [fyStartMonthInput, setFyStartMonthInput] = useState(9)
  const [fyStartMonthStep, setFyStartMonthStep] = useState('idle') // 'idle' | 'confirm'
  const [savingFyStartMonth, setSavingFyStartMonth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingAppStartDate, setSavingAppStartDate] = useState(false)
  const [error, setError] = useState('')

  const [reserveCalculation, setReserveCalculation] = useState('automatic')
  const [reserveMonths, setReserveMonths] = useState(3)
  const [reserveManualAmount, setReserveManualAmount] = useState('')
  const [reserveCalculationInput, setReserveCalculationInput] = useState('automatic')
  const [reserveMonthsInput, setReserveMonthsInput] = useState(3)
  const [reserveManualAmountInput, setReserveManualAmountInput] = useState('')
  const [savingReserve, setSavingReserve] = useState(false)
  const [reserveError, setReserveError] = useState('')

  const loadSettings = () => {
    setLoading(true)
    setError('')
    return settingsApi
      .list(token)
      .then((rows) => {
        const startDate = rows.find((row) => row.key === 'app_start_date')
        setAppStartDate(startDate?.value || null)
        setAppStartMonthInput(startDate?.value ? startDate.value.slice(0, 7) : currentMonthValue())

        const fyMonth = rows.find((row) => row.key === 'financial_year_start_month')
        const fyMonthValue = fyMonth?.value ? Number(fyMonth.value) : 9
        setFyStartMonth(fyMonthValue)
        setFyStartMonthInput(fyMonthValue)

        const calc = rows.find((row) => row.key === 'reserve_calculation')
        const calcValue = calc?.value === 'manual' ? 'manual' : 'automatic'
        setReserveCalculation(calcValue)
        setReserveCalculationInput(calcValue)

        const months = rows.find((row) => row.key === 'reserve_months')
        const monthsValue = months?.value ? Number(months.value) : 3
        setReserveMonths(monthsValue)
        setReserveMonthsInput(monthsValue)

        const manualAmount = rows.find((row) => row.key === 'reserve_manual_amount')
        setReserveManualAmount(manualAmount?.value || '')
        setReserveManualAmountInput(manualAmount?.value || '')
      })
      .catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

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

  const handleSaveReserve = async () => {
    if (reserveCalculationInput === 'manual' && !reserveManualAmountInput) {
      setReserveError('Enter a target amount')
      return
    }
    setReserveError('')
    setSavingReserve(true)
    try {
      await settingsApi.update('reserve_calculation', reserveCalculationInput, token)
      if (reserveCalculationInput === 'automatic') {
        await settingsApi.update('reserve_months', String(reserveMonthsInput), token)
      } else {
        await settingsApi.update('reserve_manual_amount', reserveManualAmountInput, token)
      }
      setReserveCalculation(reserveCalculationInput)
      setReserveMonths(reserveMonthsInput)
      setReserveManualAmount(reserveManualAmountInput)
    } catch (err) {
      setReserveError(err.message || 'Failed to save target reserve settings')
    } finally {
      setSavingReserve(false)
    }
  }

  const reserveDirty =
    reserveCalculationInput !== reserveCalculation ||
    (reserveCalculationInput === 'automatic' && reserveMonthsInput !== reserveMonths) ||
    (reserveCalculationInput === 'manual' && reserveManualAmountInput !== reserveManualAmount)

  return (
    <div>
      <h2 className="kt-panel-title">General</h2>
      <p className="kt-panel-subtitle">Financial year, app start date, and target reserve.</p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

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

      <h2 className="kt-panel-title">{terminology.term_reserve}</h2>
      <div className="kt-settings-list">
        <div className="kt-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {reserveError && (
            <div className="kt-auth-error" style={{ marginBottom: 12 }}>
              {reserveError}
            </div>
          )}
          <div className="kt-settings-row-text" style={{ marginBottom: 16 }}>
            <span className="kt-settings-row-title">{terminology.term_reserve}</span>
            <p className="kt-settings-row-description">
              Your {terminology.term_reserve.toLowerCase()} is the amount you aim to keep in reserve
              at all times. The dashboard gauge shows how close you are to this target.
            </p>
          </div>

          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <>
              <div className="kt-reserve-method-toggle">
                <button
                  type="button"
                  className={`kt-reserve-method-option${reserveCalculationInput === 'automatic' ? ' selected' : ''}`}
                  onClick={() => setReserveCalculationInput('automatic')}
                >
                  <strong>Automatic</strong>
                  <span>Calculate based on average monthly expenses</span>
                </button>
                <button
                  type="button"
                  className={`kt-reserve-method-option${reserveCalculationInput === 'manual' ? ' selected' : ''}`}
                  onClick={() => setReserveCalculationInput('manual')}
                >
                  <strong>Manual</strong>
                  <span>Set a fixed target amount</span>
                </button>
              </div>

              {reserveCalculationInput === 'automatic' ? (
                <div className="kt-field" style={{ maxWidth: 240, marginTop: 16 }}>
                  <label htmlFor="reserve-months">Months multiplier</label>
                  <select
                    id="reserve-months"
                    value={reserveMonthsInput}
                    onChange={(e) => setReserveMonthsInput(Number(e.target.value))}
                  >
                    {RESERVE_MONTH_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} month{m === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="kt-field" style={{ maxWidth: 240, marginTop: 16 }}>
                  <label htmlFor="reserve-manual-amount">Target amount</label>
                  <div className="kt-amount-input">
                    <span className="kt-amount-prefix">£</span>
                    <input
                      id="reserve-manual-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={reserveManualAmountInput}
                      onChange={(e) => setReserveManualAmountInput(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="kt-auth-button"
                  onClick={handleSaveReserve}
                  disabled={savingReserve || !reserveDirty}
                >
                  {savingReserve ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
