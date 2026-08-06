import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useAppStartDate, isMonthVisible } from '../hooks/useAppStartDate.js'
import { usePaginationState, perPageParam } from '../hooks/usePaginationState.js'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { financialYearsApi, reconciliationApi, triggerBlobDownload } from '../utils/api.js'
import { formatCurrency, monthsInFinancialYear } from '../utils/format.js'
import PaginationBar from '../components/PaginationBar.jsx'

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
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { term_reconciliation: termReconciliation, term_income: termIncome } = useTerminology()

  const [fy, setFy] = useState(null)
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null)
  const [actualBalanceInput, setActualBalanceInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  const [adminEdit, setAdminEdit] = useState(null) // { actualBalance, notes, reason, step: 'form' | 'confirm' }
  const [editSubmitting, setEditSubmitting] = useState(false)

  // "Reconciliation history" is a separate paginated table below the
  // existing month-tile picker (which only ever shows the current
  // financial year's 12 months) — it lists every reconciled month across
  // all financial years, most recent first, and is what the pagination
  // bar and CSV/PDF export operate on.
  const [history, setHistory] = useState([])
  const [historyPagination, setHistoryPagination] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyFilter, setHistoryFilter] = useState('all') // 'all' | 'stale' | 'ok'
  const { page, perPage, setPage, setPerPage } = usePaginationState('reconciliation')

  const [staleDetailOpen, setStaleDetailOpen] = useState(false)

  const appStartDate = useAppStartDate(token)
  // Phantom months before app_start_date are filtered for display here
  // rather than skipped at fetch time — the setting can still be loading
  // (null) when the initial fetch fires, and re-filtering the already-loaded
  // months on every render is simpler than re-fetching once it resolves.
  const visibleMonths = useMemo(
    () => months.filter((m) => isMonthVisible(m.year, m.month, appStartDate)),
    [months, appStartDate]
  )

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
      await loadMonths(currentFy)
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

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const isStale = historyFilter === 'all' ? undefined : historyFilter === 'stale'
      const res = await reconciliationApi.list({ page, perPage: perPageParam(perPage), isStale }, token)
      setHistory(res.data)
      setHistoryPagination(res.pagination)
    } catch (err) {
      setError(err.message || 'Failed to load reconciliation history')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, historyFilter, token])

  const handleHistoryFilterChange = (value) => {
    setHistoryFilter(value)
    setPage(1)
  }

  const handleHistoryExportCsv = async () => {
    const blob = await reconciliationApi.exportCsv(null, token)
    triggerBlobDownload(blob, 'reconciliation_export.csv')
  }

  const handleHistoryExportPdf = async () => {
    const blob = await reconciliationApi.exportPdf(null, token)
    triggerBlobDownload(blob, 'reconciliation_export.pdf')
  }

  // Picks (or re-validates) the selected month once the visible list is
  // known — separated from loadAll so it re-runs once appStartDate resolves
  // after the initial fetch, not just after a fresh load.
  useEffect(() => {
    setSelected((prev) => {
      if (prev) {
        const stillVisible = visibleMonths.find((m) => m.year === prev.year && m.month === prev.month)
        if (stillVisible) return stillVisible
      }
      const today = new Date()
      const currentKey = today.getFullYear() * 100 + (today.getMonth() + 1)
      const firstUnreconciled = visibleMonths.find((m) => !m.reconciled && m.year * 100 + m.month <= currentKey)
      return firstUnreconciled || visibleMonths[0] || null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonths])

  useEffect(() => {
    setActualBalanceInput(selected?.reconciliation ? String(selected.reconciliation.actual_balance) : '')
    setNotesInput(selected?.reconciliation?.discrepancy_notes || '')
    setAdminEdit(null)
    setStaleDetailOpen(false)
  }, [selected])

  const todayKey = useMemo(() => {
    const today = new Date()
    return today.getFullYear() * 100 + (today.getMonth() + 1)
  }, [])

  const overdue = visibleMonths.filter((m) => !m.reconciled && m.year * 100 + m.month < todayKey)

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
      await loadHistory()
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
      await reconciliationApi.update(selected.reconciliation.id, { discrepancy_notes: notesInput }, token)
      const results = await loadMonths(fy)
      const updated = results.find((m) => m.year === selected.year && m.month === selected.month)
      setSelected(updated || null)
      await loadHistory()
    } catch (err) {
      setError(err.message || 'Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  const openAdminEdit = () => {
    if (!selected?.reconciliation) return
    setAdminEdit({
      actualBalance: String(selected.reconciliation.actual_balance),
      notes: selected.reconciliation.discrepancy_notes || '',
      reason: '',
      step: 'form',
    })
  }

  const cancelAdminEdit = () => setAdminEdit(null)

  const submitAdminEdit = async () => {
    if (!selected?.reconciliation || !adminEdit) return
    setError('')
    setEditSubmitting(true)
    try {
      const payload = {
        actual_balance: Number(adminEdit.actualBalance),
        edit_reason: adminEdit.reason,
      }
      if (adminEdit.notes.trim()) payload.discrepancy_notes = adminEdit.notes.trim()
      await reconciliationApi.update(selected.reconciliation.id, payload, token)
      setAdminEdit(null)
      const results = await loadMonths(fy)
      const updated = results.find((m) => m.year === selected.year && m.month === selected.month)
      setSelected(updated || null)
      await loadHistory()
    } catch (err) {
      setError(err.message || 'Failed to save the correction')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleAdminEditSubmit = (e) => {
    e.preventDefault()
    if (!adminEdit) return
    if (adminEdit.step !== 'confirm') {
      setAdminEdit((prev) => ({ ...prev, step: 'confirm' }))
      return
    }
    submitAdminEdit()
  }

  if (loading) {
    return <p className="kt-page-subtitle">Loading {termReconciliation.toLowerCase()}…</p>
  }

  return (
    <div>
      <h1 className="kt-page-title">{termReconciliation}</h1>
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
                Set it on the {termIncome} page before reconciling — calculated balances will be
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
        {visibleMonths.map((m) => {
          const isStale = Boolean(m.reconciliation?.is_stale)
          const tone = isStale ? 'stale' : discrepancyTone(m.reconciliation?.suggested_reason)
          const isSelected = selected && m.year === selected.year && m.month === selected.month
          const isOverdue = !m.reconciled && m.year * 100 + m.month < todayKey
          return (
            <button
              type="button"
              key={`${m.year}-${m.month}`}
              className={`kt-month-tile${isSelected ? ' selected' : ''}${m.reconciled ? ' reconciled' : ''}${isOverdue ? ' overdue' : ''}${isStale ? ' stale' : ''}`}
              onClick={() => setSelected(m)}
            >
              <span className="kt-month-tile-label">{m.month_label}</span>
              <span className={`kt-month-tile-status kt-tone-${tone || (m.reconciled ? 'zero' : 'pending')}`}>
                {isStale ? 'Reconciled — stale' : m.reconciled ? 'Reconciled' : isOverdue ? 'Overdue' : 'Not reconciled'}
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
                  <span className="kt-metric-label">
                    {selected.reconciliation.is_stale ? 'Current discrepancy' : 'Discrepancy'}
                  </span>
                  <span className="kt-metric-value">{formatCurrency(selected.reconciliation.current_discrepancy)}</span>
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

              {selected.reconciliation.is_stale && (
                <div className="kt-stale-banner">
                  <button
                    type="button"
                    className="kt-stale-banner-toggle"
                    onClick={() => setStaleDetailOpen((prev) => !prev)}
                    title="This reconciliation may no longer be accurate. Click for details."
                  >
                    ⚠ Data changed since reconciliation
                  </button>
                  {staleDetailOpen && (
                    <div className="kt-stale-banner-detail">
                      <p>
                        This reconciliation may no longer be accurate. {selected.reconciliation.stale_reason} on{' '}
                        {selected.reconciliation.stale_since
                          ? new Date(selected.reconciliation.stale_since).toLocaleString('en-GB')
                          : 'an unknown date'}
                        . Edit this reconciliation to bring it up to date.
                      </p>
                      <ul className="kt-stale-banner-figures">
                        <li>
                          Original balance when reconciled:{' '}
                          {formatCurrency(selected.reconciliation.original_calculated_balance)}
                        </li>
                        <li>
                          Current calculated balance: {formatCurrency(selected.reconciliation.current_calculated_balance)}
                        </li>
                        <li>Current discrepancy: {formatCurrency(selected.reconciliation.current_discrepancy)}</li>
                        <li>
                          Change since reconciliation:{' '}
                          {formatCurrency(
                            Number(selected.reconciliation.current_calculated_balance) -
                              Number(selected.reconciliation.original_calculated_balance)
                          )}
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {isAdmin && !adminEdit && (
                <button
                  type="button"
                  className={
                    selected.reconciliation.is_stale
                      ? 'kt-auth-button kt-stale-edit-button'
                      : 'kt-category-link-button'
                  }
                  onClick={openAdminEdit}
                >
                  {selected.reconciliation.is_stale ? 'Edit now — bring up to date' : 'Edit (Admin)'}
                </button>
              )}

              {adminEdit ? (
                <form className="kt-reconcile-admin-edit-form" onSubmit={handleAdminEditSubmit}>
                  <p className="kt-admin-edit-warning">
                    Correcting a reconciled month recalculates the discrepancy and is recorded against
                    your account.
                  </p>
                  <div className="kt-field">
                    <label htmlFor="admin-edit-actual-balance">Actual balance</label>
                    <div className="kt-amount-input">
                      <span className="kt-amount-prefix">£</span>
                      <input
                        id="admin-edit-actual-balance"
                        type="number"
                        step="0.01"
                        value={adminEdit.actualBalance}
                        onChange={(e) => setAdminEdit((prev) => ({ ...prev, actualBalance: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="kt-field kt-field-wide">
                    <label htmlFor="admin-edit-notes">Discrepancy notes</label>
                    <textarea
                      id="admin-edit-notes"
                      rows={3}
                      value={adminEdit.notes}
                      onChange={(e) => setAdminEdit((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                  <div className="kt-field kt-field-wide">
                    <label htmlFor="admin-edit-reason">Reason for edit</label>
                    <textarea
                      id="admin-edit-reason"
                      rows={2}
                      value={adminEdit.reason}
                      onChange={(e) => setAdminEdit((prev) => ({ ...prev, reason: e.target.value }))}
                      placeholder="Why is this reconciliation being corrected?"
                      required
                    />
                  </div>

                  {adminEdit.step === 'confirm' ? (
                    <div className="kt-admin-edit-confirm">
                      <span className="kt-category-confirm-text">
                        Are you sure you want to edit this reconciliation? This action will be logged.
                      </span>
                      <button className="kt-auth-button" type="submit" disabled={editSubmitting}>
                        {editSubmitting ? 'Saving…' : 'Yes, save changes'}
                      </button>
                      <button type="button" className="kt-category-link-button" onClick={cancelAdminEdit}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="kt-admin-edit-actions">
                      <button className="kt-auth-button" type="submit">
                        Save changes
                      </button>
                      <button type="button" className="kt-category-link-button" onClick={cancelAdminEdit}>
                        Cancel
                      </button>
                    </div>
                  )}
                </form>
              ) : (
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
              )}

              <p className="kt-reconciled-meta">
                Reconciled by {selected.reconciliation.reconciled_by_username || 'someone'} on{' '}
                {new Date(selected.reconciliation.reconciled_at).toLocaleString('en-GB')}
              </p>

              {selected.reconciliation.edited_by && (
                <p className="kt-reconciled-meta kt-edited-meta">
                  Edited by {selected.reconciliation.edited_by_username || 'an admin'} on{' '}
                  {new Date(selected.reconciliation.edited_at).toLocaleString('en-GB')} —{' '}
                  {selected.reconciliation.edit_reason}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="kt-history-header" style={{ marginTop: 32 }}>
        <h2 className="kt-panel-title" style={{ margin: 0 }}>
          Reconciliation history
        </h2>
        <div className="kt-field kt-history-filter">
          <label htmlFor="history-filter">Show</label>
          <select
            id="history-filter"
            value={historyFilter}
            onChange={(e) => handleHistoryFilterChange(e.target.value)}
          >
            <option value="all">All</option>
            <option value="stale">Stale only</option>
            <option value="ok">Up to date</option>
          </select>
        </div>
      </div>
      {historyLoading ? (
        <p className="kt-page-subtitle">Loading history…</p>
      ) : history.length === 0 ? (
        <div className="kt-categories-empty">No reconciliations found.</div>
      ) : (
        <div className="kt-table-scroll">
          <table className="kt-invoices-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Calculated Balance</th>
                <th>Actual Balance</th>
                <th>Discrepancy</th>
                <th>Status</th>
                <th>Reconciled By</th>
                <th>Reconciled At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className={r.is_stale ? 'kt-history-row-stale' : ''}>
                  <td>{new Date(`${r.month}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</td>
                  <td>{formatCurrency(r.current_calculated_balance)}</td>
                  <td>{formatCurrency(r.actual_balance)}</td>
                  <td className={`kt-tone-${discrepancyTone(r.suggested_reason)}`}>
                    {formatCurrency(r.current_discrepancy)}
                  </td>
                  <td>
                    {r.is_stale ? (
                      <span className="kt-month-tile-status kt-tone-stale" title={r.stale_reason || ''}>
                        Stale
                      </span>
                    ) : (
                      <span className="kt-month-tile-status kt-tone-zero">Up to date</span>
                    )}
                  </td>
                  <td>{r.reconciled_by_username || 'someone'}</td>
                  <td>{new Date(r.reconciled_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        pagination={historyPagination}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        onExportCsv={handleHistoryExportCsv}
        onExportPdf={handleHistoryExportPdf}
        disabled={historyLoading}
      />
    </div>
  )
}
