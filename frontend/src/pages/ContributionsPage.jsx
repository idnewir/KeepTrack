import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useAppStartDate, isMonthVisible } from '../hooks/useAppStartDate.js'
import { usePaginationState, perPageParam } from '../hooks/usePaginationState.js'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { contributionsApi, financialYearsApi, triggerBlobDownload } from '../utils/api.js'
import { formatCurrency, monthsInFinancialYear } from '../utils/format.js'
import PaginationBar from '../components/PaginationBar.jsx'

export default function ContributionsPage() {
  const { user } = useAuth()
  const token = user?.token
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canRecord = user?.role !== 'readonly'
  // Full terminology support (letting an org rename "Contributions" to
  // "Income", "Donations", etc.) — see docs/decisions-log.md.
  const { term_income: INCOME_LABEL } = useTerminology()

  const [fy, setFy] = useState(null)
  const [summary, setSummary] = useState(null)
  const [contributions, setContributions] = useState([])
  const [pagination, setPagination] = useState(null)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { page, perPage, setPage, setPerPage } = usePaginationState('contributions')

  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [savingBalance, setSavingBalance] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [formMonth, setFormMonth] = useState('')
  const [formGroup, setFormGroup] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editMonth, setEditMonth] = useState('')
  const [editGroup, setEditGroup] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const appStartDate = useAppStartDate(token)
  // The monthly-summary table's rows already come pre-filtered from
  // GET /contributions/monthly-summary (backend/routers/contributions.py),
  // but "All entries" reads from the separate, unfiltered GET /contributions
  // list — so it needs its own client-side filter, using the FY's own
  // month->year mapping since a bare contribution only carries a month number.
  const monthYearByNumber = useMemo(() => {
    const map = {}
    for (const { year, month } of monthsInFinancialYear(fy)) map[month] = year
    return map
  }, [fy])
  const visibleContributions = useMemo(
    () => contributions.filter((c) => isMonthVisible(monthYearByNumber[c.month], c.month, appStartDate)),
    [contributions, monthYearByNumber, appStartDate]
  )

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const currentFy = await financialYearsApi.current(token)
      setFy(currentFy)
      const summaryData = await contributionsApi.monthlySummary(currentFy.id, token)
      setSummary(summaryData)
    } catch (err) {
      setError(err.message || `Failed to load ${INCOME_LABEL.toLowerCase()}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const loadEntries = async () => {
    if (!fy) return
    setEntriesLoading(true)
    try {
      const res = await contributionsApi.list(
        { financialYearId: fy.id, page, perPage: perPageParam(perPage) },
        token
      )
      setContributions(res.data)
      setPagination(res.pagination)
    } catch (err) {
      setError(err.message || `Failed to load ${INCOME_LABEL.toLowerCase()} entries`)
    } finally {
      setEntriesLoading(false)
    }
  }

  const isFirstEntriesRender = useRef(true)
  useEffect(() => {
    if (isFirstEntriesRender.current) {
      isFirstEntriesRender.current = false
      return
    }
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy?.id])

  useEffect(() => {
    loadEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy?.id, page, perPage, token])

  const handleExportCsv = async () => {
    const blob = await contributionsApi.exportCsv({ financialYearId: fy?.id }, token)
    triggerBlobDownload(blob, 'contributions_export.csv')
  }

  const handleExportPdf = async () => {
    const blob = await contributionsApi.exportPdf({ financialYearId: fy?.id }, token)
    triggerBlobDownload(blob, 'contributions_export.pdf')
  }

  const monthOptions = summary?.rows || []
  const groupNames = useMemo(
    () => Array.from(new Set(contributions.map((c) => c.group_name))).sort(),
    [contributions]
  )

  const startEditBalance = () => {
    setBalanceInput(fy?.opening_balance != null ? String(fy.opening_balance) : '')
    setEditingBalance(true)
  }

  const handleSaveBalance = async (e) => {
    e.preventDefault()
    setError('')
    setSavingBalance(true)
    try {
      const updated = await financialYearsApi.setOpeningBalance(fy.id, Number(balanceInput), token)
      setFy(updated)
      setEditingBalance(false)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to save opening balance')
    } finally {
      setSavingBalance(false)
    }
  }

  const resetAddForm = () => {
    setFormMonth('')
    setFormGroup('')
    setFormAmount('')
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSavingNew(true)
    try {
      await contributionsApi.create(
        {
          financial_year_id: fy.id,
          month: Number(formMonth),
          group_name: formGroup.trim(),
          amount: Number(formAmount),
        },
        token
      )
      resetAddForm()
      setShowAddForm(false)
      await Promise.all([loadAll(), loadEntries()])
    } catch (err) {
      setError(err.message || `Failed to record ${INCOME_LABEL.toLowerCase()}`)
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (c) => {
    setError('')
    setEditingId(c.id)
    setEditMonth(String(c.month))
    setEditGroup(c.group_name)
    setEditAmount(String(c.amount))
  }

  const handleEditSave = async (id) => {
    setError('')
    setSavingEdit(true)
    try {
      await contributionsApi.update(
        id,
        { month: Number(editMonth), group_name: editGroup.trim(), amount: Number(editAmount) },
        token
      )
      setEditingId(null)
      await Promise.all([loadAll(), loadEntries()])
    } catch (err) {
      setError(err.message || `Failed to update ${INCOME_LABEL.toLowerCase()}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await contributionsApi.remove(id, token)
      setConfirmingId(null)
      await Promise.all([loadAll(), loadEntries()])
    } catch (err) {
      setError(err.message || `Failed to delete ${INCOME_LABEL.toLowerCase()}`)
    } finally {
      setBusyId(null)
    }
  }

  const monthLabelFor = (monthNumber) => monthOptions.find((r) => r.month === monthNumber)?.month_label || monthNumber

  if (loading) {
    return <p className="kt-page-subtitle">Loading {INCOME_LABEL.toLowerCase()}…</p>
  }

  return (
    <div>
      <h1 className="kt-page-title">{INCOME_LABEL}</h1>
      <p className="kt-page-subtitle">
        Record monthly {INCOME_LABEL.toLowerCase()} by group or source
        {fy ? ` for financial year ${fy.label}` : ''}.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {fy && (
        <div className="kt-opening-balance-panel">
          {fy.opening_balance == null ? (
            <div className="kt-opening-balance-prompt">
              <div>
                <strong>No opening balance set for {fy.label}.</strong>
                <p>
                  Set the opening balance for this financial year so running balances and
                  reconciliation can be calculated correctly.
                </p>
              </div>
              {isAdmin && !editingBalance && (
                <button type="button" className="kt-auth-button" onClick={startEditBalance}>
                  Set opening balance
                </button>
              )}
            </div>
          ) : (
            <div className="kt-opening-balance-row">
              <div>
                <span className="kt-opening-balance-label">Opening balance ({fy.label})</span>
                <span className="kt-opening-balance-value">{formatCurrency(fy.opening_balance)}</span>
              </div>
              {isAdmin && !editingBalance && (
                <button type="button" className="kt-category-link-button" onClick={startEditBalance}>
                  Edit
                </button>
              )}
            </div>
          )}

          {editingBalance && (
            <form className="kt-opening-balance-form" onSubmit={handleSaveBalance}>
              <div className="kt-field">
                <label htmlFor="opening-balance-input">Opening balance</label>
                <div className="kt-amount-input">
                  <span className="kt-amount-prefix">£</span>
                  <input
                    id="opening-balance-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="kt-review-actions">
                <button className="kt-auth-button" type="submit" disabled={savingBalance}>
                  {savingBalance ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => setEditingBalance(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {canRecord && (
        <div className="kt-categories-toolbar">
          <button
            type="button"
            className="kt-auth-button kt-categories-add-button"
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'Cancel' : `+ Record ${INCOME_LABEL.toLowerCase()}`}
          </button>
        </div>
      )}

      {showAddForm && (
        <form className="kt-categories-form" onSubmit={handleAdd}>
          <div className="kt-field">
            <label htmlFor="new-contribution-month">Month</label>
            <select
              id="new-contribution-month"
              value={formMonth}
              onChange={(e) => setFormMonth(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a month
              </option>
              {monthOptions.map((row) => (
                <option key={row.month} value={row.month}>
                  {row.month_label}
                </option>
              ))}
            </select>
          </div>
          <div className="kt-field">
            <label htmlFor="new-contribution-group">Group / source</label>
            <input
              id="new-contribution-group"
              type="text"
              list="contribution-group-names"
              value={formGroup}
              maxLength={100}
              onChange={(e) => setFormGroup(e.target.value)}
              required
            />
            <datalist id="contribution-group-names">
              {groupNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="kt-field">
            <label htmlFor="new-contribution-amount">Amount</label>
            <div className="kt-amount-input">
              <span className="kt-amount-prefix">£</span>
              <input
                id="new-contribution-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <button className="kt-auth-button" type="submit" disabled={savingNew}>
            {savingNew ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      <h2 className="kt-panel-title" style={{ marginTop: 32 }}>
        Monthly summary
      </h2>
      {summary && summary.groups.length === 0 ? (
        <div className="kt-categories-empty">
          No {INCOME_LABEL.toLowerCase()} recorded yet for {fy?.label}.
        </div>
      ) : (
        summary && (
          <div className="kt-table-scroll">
            <table className="kt-invoices-table kt-summary-table">
              <thead>
                <tr>
                  <th>Month</th>
                  {summary.groups.map((group) => (
                    <th key={group}>{group}</th>
                  ))}
                  <th>Total</th>
                  <th>Running balance</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={`${row.year}-${row.month}`}>
                    <td>{row.month_label}</td>
                    {summary.groups.map((group) => (
                      <td key={group}>{formatCurrency(row.breakdown[group] || 0)}</td>
                    ))}
                    <td>
                      <strong>{formatCurrency(row.total)}</strong>
                    </td>
                    <td className={row.running_balance < 0 ? 'kt-negative-balance' : ''}>
                      {formatCurrency(row.running_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <h2 className="kt-panel-title" style={{ marginTop: 32 }}>
        All entries
      </h2>
      {entriesLoading ? (
        <p className="kt-page-subtitle">Loading entries…</p>
      ) : visibleContributions.length === 0 ? (
        <div className="kt-categories-empty">
          No {INCOME_LABEL.toLowerCase()} entries yet.
        </div>
      ) : (
        <ul className="kt-categories-list">
          {visibleContributions.map((c) => (
            <li key={c.id} className="kt-category-row">
              {editingId === c.id ? (
                <>
                  <select value={editMonth} onChange={(e) => setEditMonth(e.target.value)}>
                    {monthOptions.map((row) => (
                      <option key={row.month} value={row.month}>
                        {row.month_label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editGroup}
                    maxLength={100}
                    onChange={(e) => setEditGroup(e.target.value)}
                    className="kt-category-name-input"
                    aria-label="Group name"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    style={{ width: 100 }}
                    aria-label="Amount"
                  />
                  <div className="kt-category-actions">
                    <button
                      type="button"
                      className="kt-category-link-button"
                      onClick={() => handleEditSave(c.id)}
                      disabled={savingEdit}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="kt-category-link-button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="kt-category-name">{monthLabelFor(c.month)}</span>
                  <span className="kt-category-name">{c.group_name}</span>
                  <span className="kt-category-name">{formatCurrency(c.amount)}</span>
                  {canRecord && (
                    <div className="kt-category-actions">
                      <button
                        type="button"
                        className="kt-category-link-button"
                        onClick={() => startEdit(c)}
                      >
                        Edit
                      </button>
                      {isAdmin &&
                        (confirmingId === c.id ? (
                          <>
                            <span className="kt-category-confirm-text">Delete?</span>
                            <button
                              type="button"
                              className="kt-category-link-button kt-category-danger"
                              onClick={() => handleDelete(c.id)}
                              disabled={busyId === c.id}
                            >
                              {busyId === c.id ? 'Deleting…' : 'Yes, delete'}
                            </button>
                            <button
                              type="button"
                              className="kt-category-link-button"
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="kt-category-link-button kt-category-danger"
                            onClick={() => setConfirmingId(c.id)}
                          >
                            Delete
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <PaginationBar
        pagination={pagination}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        disabled={entriesLoading}
      />
    </div>
  )
}
