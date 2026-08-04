import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { financialYearsApi, reconciliationApi } from '../utils/api.js'
import { formatCurrency } from '../utils/format.js'

function monthsInFinancialYear(fy) {
  if (!fy) return []
  const start = new Date(fy.start_date)
  const months = []
  for (let i = 0; i < 12; i++) {
    const year = start.getFullYear()
    const month = start.getMonth() + 1
    months.push({ year, month })
    start.setMonth(start.getMonth() + 1)
  }
  return months
}

function discrepancyTone(reason) {
  if (!reason) return ''
  if (reason.startsWith('Fully')) return 'zero'
  if (reason.startsWith('Small')) return 'small'
  return 'large'
}

export default function ReconciliationPage() {
  const { user } = useAuth()
  const token = user?.token
  const canReconcile = user?.role !== 'readonly'

  const [fy, setFy] = useState(null)
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null)
  const [actualBalanceInput, setActualBalanceInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  const loadMonths = async (currentFy) => {
    const targets = monthsInFinancialYear(currentFy)
    const results = await Promise.all(
      targets.map(({ year, month }) => reconciliationApi.getMonth(year, month, token))
    )
    setMonths(results)
    return results
  }

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const currentFy = await financialYearsApi.current(token)
      setFy(currentFy)
      const results = await loadMonths(currentFy)
      setSelected((prev) => {
        if (prev) {
          const stillThere = results.find((m) => m.year === prev.year && m.month === prev.month)
          if (stillThere) return stillThere
        }
        const today = new Date()
        const currentKey = today.getFullYear() * 100 + (today.getMonth() + 1)
        const firstUnreconciled = results.find((m) => !m.reconciled && m.year * 100 + m.month <= currentKey)
        return firstUnreconciled || results[0] || null
      })
    } catch (err) {
      setError(err.message || 'Failed to load reconciliation data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    setActualBalanceInput(selected?.reconciliation ? String(selected.reconciliation.actual_balance) : '')
    setNotesInput(selected?.reconciliation?.discrepancy_notes || '')
  }, [selected])

  const todayKey = useMemo(() => {
    const today = new Date()
    return today.getFullYear() * 100 + (today.getMonth() + 1)
  }, [])

  const overdue = months.filter((m) => !m.reconciled && m.year * 100 + m.month < todayKey)

  const handleReconcile = async (e) => {
    e.preventDefault()
    if (!selected) return
    setError('')
    setSubmitting(true)
    try {
      await reconciliationApi.create(
        {
          financial_year_id: selected.financial_year_id,
          month: selected.month_date,
          actual_balance: Number(actualBalanceInput),
        },
        token
      )
      const results = await loadMonths(fy)
      const updated = results.find((m) => m.year === selected.year && m.month === selected.month)
      setSelected(updated || null)
    } catch (err) {
      setError(err.message || 'Failed to submit reconciliation')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveNotes = async (e) => {
    e.preventDefault()
    if (!selected?.reconciliation) return
    setError('')
    setSavingNotes(true)
    try {
      await reconciliationApi.update(selected.reconciliation.id, notesInput, token)
      const results = await loadMonths(fy)
      const updated = results.find((m) => m.year === selected.year && m.month === selected.month)
      setSelected(updated || null)
    } catch (err) {
      setError(err.message || 'Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  if (loading) {
    return <p className="kt-page-subtitle">Loading reconciliation…</p>
  }

  return (
    <div>
      <h1 className="kt-page-title">Reconciliation</h1>
      <p className="kt-page-subtitle">
        Compare the calculated balance against the actual bank balance for each month
        {fy ? ` of financial year ${fy.label}` : ''}.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {fy && fy.opening_balance == null && (
        <div className="kt-opening-balance-panel">
          <div className="kt-opening-balance-prompt">
            <div>
              <strong>No opening balance set for {fy.label}.</strong>
              <p>
                Set it on the Contributions page before reconciling — calculated balances will be
                inaccurate without it.
              </p>
            </div>
          </div>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="kt-notification kt-notification-urgent" style={{ marginBottom: 20 }}>
          <span className="kt-notification-message">
            {overdue.length} previous month{overdue.length !== 1 ? 's' : ''} still not reconciled:{' '}
            {overdue.map((m) => m.month_label).join(', ')}
          </span>
        </div>
      )}

      <div className="kt-month-tiles">
        {months.map((m) => {
          const tone = discrepancyTone(m.reconciliation?.suggested_reason)
          const isSelected = selected && m.year === selected.year && m.month === selected.month
          const isOverdue = !m.reconciled && m.year * 100 + m.month < todayKey
          return (
            <button
              type="button"
              key={`${m.year}-${m.month}`}
              className={`kt-month-tile${isSelected ? ' selected' : ''}${m.reconciled ? ' reconciled' : ''}${isOverdue ? ' overdue' : ''}`}
              onClick={() => setSelected(m)}
            >
              <span className="kt-month-tile-label">{m.month_label}</span>
              <span className={`kt-month-tile-status kt-tone-${tone || (m.reconciled ? 'zero' : 'pending')}`}>
                {m.reconciled ? 'Reconciled' : isOverdue ? 'Overdue' : 'Not reconciled'}
              </span>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="kt-dashboard-panel kt-reconciliation-detail">
          <h2 className="kt-panel-title">{selected.month_label}</h2>

          <div className="kt-reconciliation-figures">
            <div className="kt-metric-card">
              <span className="kt-metric-label">Calculated balance</span>
              <span className="kt-metric-value">{formatCurrency(selected.calculated_balance)}</span>
            </div>

            {selected.reconciliation ? (
              <>
                <div className="kt-metric-card">
                  <span className="kt-metric-label">Actual balance</span>
                  <span className="kt-metric-value">{formatCurrency(selected.reconciliation.actual_balance)}</span>
                </div>
                <div className={`kt-metric-card kt-tone-${discrepancyTone(selected.reconciliation.suggested_reason)}`}>
                  <span className="kt-metric-label">Discrepancy</span>
                  <span className="kt-metric-value">{formatCurrency(selected.reconciliation.discrepancy)}</span>
                </div>
              </>
            ) : canReconcile ? (
              <form className="kt-reconcile-form" onSubmit={handleReconcile}>
                <div className="kt-field">
                  <label htmlFor="actual-balance-input">Actual balance (from bank statement)</label>
                  <div className="kt-amount-input">
                    <span className="kt-amount-prefix">£</span>
                    <input
                      id="actual-balance-input"
                      type="number"
                      step="0.01"
                      value={actualBalanceInput}
                      onChange={(e) => setActualBalanceInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button className="kt-auth-button" type="submit" disabled={submitting}>
                  {submitting ? 'Reconciling…' : 'Reconcile'}
                </button>
              </form>
            ) : (
              <div className="kt-panel-empty">This month has not been reconciled yet.</div>
            )}
          </div>

          {selected.reconciliation && (
            <>
              <p className="kt-suggested-reason">{selected.reconciliation.suggested_reason}</p>

              <form className="kt-reconcile-notes-form" onSubmit={handleSaveNotes}>
                <div className="kt-field">
                  <label htmlFor="discrepancy-notes">Notes</label>
                  <textarea
                    id="discrepancy-notes"
                    rows={3}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Add your own explanation for this discrepancy…"
                    disabled={!canReconcile}
                  />
                </div>
                {canReconcile && (
                  <button className="kt-auth-button kt-reconcile-notes-save" type="submit" disabled={savingNotes}>
                    {savingNotes ? 'Saving…' : 'Save notes'}
                  </button>
                )}
              </form>

              <p className="kt-reconciled-meta">
                Reconciled by {selected.reconciliation.reconciled_by_username || 'someone'} on{' '}
                {new Date(selected.reconciliation.reconciled_at).toLocaleString('en-GB')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
