import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useDebtTerminology } from '../context/DebtTerminologyContext.jsx'
import Modal from '../components/Modal.jsx'
import { debtsApi } from '../utils/api.js'
import { addMonthsFromToday, formatCurrency, formatDate, formatDateTime } from '../utils/format.js'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const DEBT_TYPE_LABELS = {
  credit_card: 'Credit Card',
  loan: 'Loan',
  mortgage: 'Mortgage',
  car_finance: 'Car Finance',
  overdraft: 'Overdraft',
  bnpl: 'Buy Now Pay Later',
  other: 'Other',
}

const CREDIT_LIMIT_TYPES = new Set(['credit_card', 'overdraft'])

function debtTypeLabel(debt) {
  if (debt.debt_type === 'other') return debt.custom_type_label || 'Other'
  return DEBT_TYPE_LABELS[debt.debt_type] || debt.debt_type
}

// Month-by-month balance simulation for the chart — mirrors
// backend/services/debt_calculator.py's amortisation model closely enough
// for a visual projection (the authoritative months_remaining/total_interest
// figures always come from the API, this is only used to draw the line).
function buildProjectedSeries(debt) {
  const balance = Number(debt.current_balance)
  const payment = Number(debt.monthly_payment)
  const points = [{ month: 0, balance }]
  if (balance <= 0 || payment <= 0) return { points, rateChangeMonth: null }

  const isPromo = debt.rate_type !== 'standard' && debt.promotional_end_date
  if (!isPromo) {
    const rate = Number(debt.interest_rate) / 100 / 12
    let b = balance
    for (let i = 1; i <= 600 && b > 0; i++) {
      const interest = b * rate
      b = Math.max(0, b + interest - payment)
      points.push({ month: i, balance: b })
    }
    return { points, rateChangeMonth: null }
  }

  const promoRate = Number(debt.interest_rate) / 100 / 12
  const standardRate = Number(debt.standard_rate_after_promo || 0) / 100 / 12
  const promoMonths = Math.max(Math.ceil((debt.days_until_promo_ends ?? 0) / 30), 0)

  let b = balance
  let month = 0
  for (; month < promoMonths && b > 0; month++) {
    const interest = b * promoRate
    b = Math.max(0, b + interest - payment)
    points.push({ month: month + 1, balance: b })
  }
  const rateChangeMonth = month
  let guard = 0
  while (b > 0 && guard < 600) {
    const interest = b * standardRate
    b = Math.max(0, b + interest - payment)
    month += 1
    points.push({ month, balance: b })
    guard += 1
  }
  return { points, rateChangeMonth }
}

// Historical points, in "months before today" (negative), from the debt's
// original balance down through each recorded payment in date order.
function buildActualSeries(debt) {
  const today = new Date()
  const monthsAgo = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`)
    return (d - today) / (1000 * 60 * 60 * 24 * 30.44)
  }
  const paymentsAsc = [...debt.payments].sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1))
  let running = Number(debt.original_balance)
  const points = [{ month: monthsAgo(debt.start_date), balance: running }]
  for (const p of paymentsAsc) {
    running = Math.max(0, running - Number(p.amount))
    points.push({ month: monthsAgo(p.payment_date), balance: running })
  }
  return points
}

function DebtBalanceChart({ debt }) {
  const actual = useMemo(() => buildActualSeries(debt), [debt])
  const { points: projected, rateChangeMonth } = useMemo(() => buildProjectedSeries(debt), [debt])

  const all = [...actual, ...projected]
  if (all.length < 2) {
    return <div className="kt-dashboard-empty">Not enough data yet to chart balance over time.</div>
  }

  const WIDTH = 720
  const HEIGHT = 220
  const MARGIN = { top: 10, right: 16, bottom: 28, left: 72 }
  const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right
  const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

  const minMonth = Math.min(...all.map((p) => p.month))
  const maxMonth = Math.max(...all.map((p) => p.month), 1)
  const maxBalance = Math.max(...all.map((p) => p.balance), 1) * 1.1

  const xFor = (m) => MARGIN.left + ((m - minMonth) / (maxMonth - minMonth || 1)) * INNER_WIDTH
  const yFor = (v) => MARGIN.top + INNER_HEIGHT - (v / maxBalance) * INNER_HEIGHT

  const actualPath = actual.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.month)},${yFor(p.balance)}`).join(' ')
  const projectedPath = projected.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.month)},${yFor(p.balance)}`).join(' ')

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxBalance * f))
  const rateChangeX = rateChangeMonth != null ? xFor(rateChangeMonth) : null

  return (
    <div className="kt-chart-wrap">
      <div className="kt-chart-legend">
        <span className="kt-chart-legend-item kt-chart-legend-static">
          <span className="kt-chart-swatch" style={{ background: 'var(--kt-primary)' }} />
          Actual payments
        </span>
        <span className="kt-chart-legend-item kt-chart-legend-static">
          <span className="kt-chart-swatch" style={{ background: '#C97A0C' }} />
          Projected
        </span>
        {rateChangeX != null && (
          <span className="kt-chart-legend-item kt-chart-legend-static">
            <span className="kt-chart-swatch" style={{ background: '#B3441E' }} />
            Rate change
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="kt-chart-svg" role="img" aria-label="Balance over time">
        {gridTicks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yFor(tick)} y2={yFor(tick)} stroke="var(--kt-border)" strokeWidth="1" />
            <text x={MARGIN.left - 8} y={yFor(tick) + 4} textAnchor="end" className="kt-chart-axis-label">
              {formatCurrency(tick).replace('.00', '')}
            </text>
          </g>
        ))}

        {rateChangeX != null && (
          <line x1={rateChangeX} x2={rateChangeX} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="#B3441E" strokeWidth="1.5" strokeDasharray="4 3" />
        )}

        <path d={actualPath} fill="none" stroke="var(--kt-primary)" strokeWidth="2" />
        <path d={projectedPath} fill="none" stroke="#C97A0C" strokeWidth="2" strokeDasharray="6 4" />

        {actual.map((p, i) => (
          <circle key={i} cx={xFor(p.month)} cy={yFor(p.balance)} r="3.5" fill="var(--kt-primary)" />
        ))}

        <text x={MARGIN.left} y={HEIGHT - 6} textAnchor="start" className="kt-chart-axis-label">
          {Math.round(minMonth)} months ago
        </text>
        <text x={WIDTH - MARGIN.right} y={HEIGHT - 6} textAnchor="end" className="kt-chart-axis-label">
          {Math.round(maxMonth)} months ahead
        </text>
      </svg>
    </div>
  )
}

function SingleScenarioPanel({ debt }) {
  const payoff = debt.payoff
  if (payoff.warning) {
    const monthlyInterest = (Number(debt.current_balance) * Number(debt.interest_rate)) / 100 / 12
    const growth = monthlyInterest - Number(debt.monthly_payment)
    return (
      <div className="kt-debt-payoff-warning">
        Your monthly payment does not cover the interest. Your balance is growing by{' '}
        <strong>{formatCurrency(growth)}</strong> per month.
      </div>
    )
  }
  return (
    <div className="kt-metric-row">
      <div className="kt-metric-card">
        <span className="kt-metric-label">Months remaining</span>
        <span className="kt-metric-value">{payoff.months_remaining}</span>
      </div>
      <div className="kt-metric-card">
        <span className="kt-metric-label">Total interest to pay</span>
        <span className="kt-metric-value">{formatCurrency(payoff.total_interest)}</span>
      </div>
      <div className="kt-metric-card">
        <span className="kt-metric-label">Total amount to pay</span>
        <span className="kt-metric-value">{formatCurrency(payoff.total_to_pay)}</span>
      </div>
      <div className="kt-metric-card">
        <span className="kt-metric-label">Estimated payoff date</span>
        <span className="kt-metric-value">{addMonthsFromToday(payoff.months_remaining)}</span>
      </div>
    </div>
  )
}

function ScenarioPanel({ title, payoff }) {
  return (
    <div className="kt-debt-scenario-panel">
      <h3 className="kt-panel-title">{title}</h3>
      {payoff.warning ? (
        <div className="kt-debt-payoff-warning">{payoff.warning_message}</div>
      ) : (
        <ul className="kt-debt-scenario-list">
          <li>
            <span>Months remaining</span>
            <strong>{payoff.months_remaining}</strong>
          </li>
          <li>
            <span>Total interest</span>
            <strong>{formatCurrency(payoff.total_interest)}</strong>
          </li>
          <li>
            <span>Total to pay</span>
            <strong>{formatCurrency(payoff.total_to_pay)}</strong>
          </li>
          <li>
            <span>Estimated payoff date</span>
            <strong>{addMonthsFromToday(payoff.months_remaining)}</strong>
          </li>
        </ul>
      )}
    </div>
  )
}

function DualScenarioPanels({ debt }) {
  const { current, standard } = debt.payoff
  const diff =
    !current.warning && !standard.warning ? Number(standard.total_interest) - Number(current.total_interest) : null
  return (
    <div>
      <div className="kt-debt-dual-scenarios">
        <ScenarioPanel title={`At current ${Number(debt.interest_rate)}% rate`} payoff={current} />
        <ScenarioPanel
          title={`Once standard ${Number(debt.standard_rate_after_promo)}% rate applies`}
          payoff={standard}
        />
      </div>
      <p className="kt-panel-subtitle" style={{ marginTop: 12 }}>
        Standard rate applies from {formatDate(debt.promotional_end_date)}
      </p>
      {diff != null && diff > 0 && (
        <p className="kt-debt-dual-diff">
          You will pay {formatCurrency(diff)} more in interest if not paid off before the promotional rate ends.
        </p>
      )}
    </div>
  )
}

export default function DebtDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canManage = user?.role !== 'readonly'
  const terminology = useDebtTerminology()
  const termDebt = terminology.debt_term_debt
  const termPayment = terminology.debt_term_payment

  const [debt, setDebt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const [notesEditing, setNotesEditing] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  const [confirmAction, setConfirmAction] = useState(null) // 'mark-paid' | 'delete'
  const [actionBusy, setActionBusy] = useState(false)

  const [paymentDeleteId, setPaymentDeleteId] = useState(null)
  const [paymentDeleteBusy, setPaymentDeleteBusy] = useState(false)
  const [paymentPage, setPaymentPage] = useState(1)
  const PAGE_SIZE = 10

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: todayStr(), notes: '' })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    return debtsApi
      .get(id, token)
      .then(setDebt)
      .catch((err) => setError(err.message || `Failed to load ${termDebt.toLowerCase()}`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token])

  if (loading && !debt) return <p className="kt-page-subtitle">Loading {termDebt.toLowerCase()}…</p>
  if (!debt) {
    return (
      <div>
        <div className="kt-auth-error">{error || `${termDebt} not found`}</div>
        <Link to="/debts">← Back to {termDebt.toLowerCase()}s</Link>
      </div>
    )
  }

  const openEdit = () => {
    setEditForm({
      name: debt.name,
      debtType: debt.debt_type,
      customTypeLabel: debt.custom_type_label || '',
      currentBalance: String(debt.current_balance),
      creditLimit: debt.credit_limit != null ? String(debt.credit_limit) : '',
      monthlyPayment: String(debt.monthly_payment),
      paymentDueDay: String(debt.payment_due_day),
      expectedEndDate: debt.expected_end_date || '',
      rateType: debt.rate_type,
      interestRate: String(debt.interest_rate),
      promotionalEndDate: debt.promotional_end_date || '',
      standardRateAfterPromo: debt.standard_rate_after_promo != null ? String(debt.standard_rate_after_promo) : '',
    })
    setEditing(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const isPromo = editForm.rateType !== 'standard'
      await debtsApi.update(
        debt.id,
        {
          name: editForm.name.trim(),
          debt_type: editForm.debtType,
          custom_type_label: editForm.debtType === 'other' ? editForm.customTypeLabel.trim() || null : null,
          current_balance: Number(editForm.currentBalance),
          credit_limit: editForm.creditLimit ? Number(editForm.creditLimit) : null,
          monthly_payment: Number(editForm.monthlyPayment),
          payment_due_day: Number(editForm.paymentDueDay),
          expected_end_date: editForm.expectedEndDate || null,
          interest_rate: editForm.rateType === 'zero' ? 0 : Number(editForm.interestRate),
          rate_type: editForm.rateType,
          promotional_end_date: isPromo ? editForm.promotionalEndDate : null,
          standard_rate_after_promo: isPromo && editForm.standardRateAfterPromo ? Number(editForm.standardRateAfterPromo) : null,
        },
        token
      )
      setEditing(false)
      await load()
    } catch (err) {
      setError(err.message || `Failed to save ${termDebt.toLowerCase()}`)
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async () => {
    setActionBusy(true)
    setError('')
    try {
      await debtsApi.markPaid(debt.id, token)
      setConfirmAction(null)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to mark as paid off')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDelete = async () => {
    setActionBusy(true)
    setError('')
    try {
      await debtsApi.remove(debt.id, token)
      navigate('/debts')
    } catch (err) {
      setError(err.message || `Failed to delete ${termDebt.toLowerCase()}`)
      setActionBusy(false)
    }
  }

  const openNotesEdit = () => {
    setNotesDraft(debt.notes || '')
    setNotesEditing(true)
  }

  const handleNotesSave = async () => {
    setNotesSaving(true)
    setError('')
    try {
      await debtsApi.update(debt.id, { notes: notesDraft.trim() || null }, token)
      setNotesEditing(false)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to save notes')
    } finally {
      setNotesSaving(false)
    }
  }

  const openPaymentModal = () => {
    setPaymentError('')
    setPaymentForm({ amount: String(debt.monthly_payment), date: todayStr(), notes: '' })
    setShowPaymentModal(true)
  }

  const handleLogPayment = async (e) => {
    e.preventDefault()
    setPaymentError('')
    setPaymentSaving(true)
    try {
      await debtsApi.addPayment(
        debt.id,
        { amount: Number(paymentForm.amount), payment_date: paymentForm.date, notes: paymentForm.notes.trim() || null },
        token
      )
      setShowPaymentModal(false)
      setPaymentPage(1)
      await load()
    } catch (err) {
      setPaymentError(err.message || `Failed to log ${termPayment.toLowerCase()}`)
    } finally {
      setPaymentSaving(false)
    }
  }

  const handleDeletePayment = async (paymentId) => {
    setPaymentDeleteBusy(true)
    setError('')
    try {
      await debtsApi.removePayment(debt.id, paymentId, token)
      setPaymentDeleteId(null)
      await load()
    } catch (err) {
      setError(err.message || 'Failed to delete payment')
    } finally {
      setPaymentDeleteBusy(false)
    }
  }

  const isDualScenario = debt.rate_type !== 'standard' && debt.promotional_end_date && debt.payoff?.current
  const promoMonthsRemaining = debt.days_until_promo_ends != null ? Math.max(Math.ceil(debt.days_until_promo_ends / 30), 1) : null
  const suggestedMonthly =
    promoMonthsRemaining != null ? Number(debt.current_balance) / promoMonthsRemaining : null

  const totalPaymentPages = Math.max(1, Math.ceil(debt.payments.length / PAGE_SIZE))
  const pagedPayments = debt.payments.slice((paymentPage - 1) * PAGE_SIZE, paymentPage * PAGE_SIZE)

  return (
    <div>
      <p>
        <Link to="/debts">← Back to {termDebt.toLowerCase()}s</Link>
      </p>

      <div className="kt-project-detail-header">
        <h1 className="kt-page-title">{debt.name}</h1>
        {debt.is_paid_off && <span className="kt-debt-paidoff-badge">✓ Paid off</span>}
      </div>
      <p className="kt-page-subtitle">{debtTypeLabel(debt)}</p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Debt summary card */}
      <div className="kt-dashboard-panel">
        <div className="kt-debt-detail-summary-header">
          <h2 className="kt-panel-title">Summary</h2>
          <div className="kt-category-actions">
            {canManage && !debt.is_paid_off && (
              <button type="button" className="kt-category-link-button" onClick={openEdit}>
                Edit
              </button>
            )}
            {canManage && !debt.is_paid_off && (
              confirmAction === 'mark-paid' ? (
                <>
                  <span className="kt-category-confirm-text">Mark as paid off?</span>
                  <button type="button" className="kt-category-link-button" onClick={handleMarkPaid} disabled={actionBusy}>
                    {actionBusy ? 'Saving…' : 'Yes, mark paid off'}
                  </button>
                  <button type="button" className="kt-category-link-button" onClick={() => setConfirmAction(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="kt-category-link-button" onClick={() => setConfirmAction('mark-paid')}>
                  Mark as paid off
                </button>
              )
            )}
            {isAdmin &&
              (confirmAction === 'delete' ? (
                <>
                  <span className="kt-category-confirm-text">Delete this {termDebt.toLowerCase()}?</span>
                  <button
                    type="button"
                    className="kt-category-link-button kt-category-danger"
                    onClick={handleDelete}
                    disabled={actionBusy}
                  >
                    {actionBusy ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button type="button" className="kt-category-link-button" onClick={() => setConfirmAction(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="kt-category-link-button kt-category-danger"
                  onClick={() => setConfirmAction('delete')}
                >
                  Delete
                </button>
              ))}
          </div>
        </div>

        {editing ? (
          <form className="kt-project-form kt-debt-form" onSubmit={handleEditSubmit}>
            <div className="kt-field">
              <label htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                type="text"
                value={editForm.name}
                maxLength={255}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="kt-field">
              <label htmlFor="edit-type">Type</label>
              <select id="edit-type" value={editForm.debtType} onChange={(e) => setEditForm((f) => ({ ...f, debtType: e.target.value }))}>
                {Object.entries(DEBT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {editForm.debtType === 'other' && (
              <div className="kt-field">
                <label htmlFor="edit-custom-type">Custom type label</label>
                <input
                  id="edit-custom-type"
                  type="text"
                  maxLength={100}
                  value={editForm.customTypeLabel}
                  onChange={(e) => setEditForm((f) => ({ ...f, customTypeLabel: e.target.value }))}
                  required
                />
              </div>
            )}
            <div className="kt-field">
              <label htmlFor="edit-balance">Current balance</label>
              <div className="kt-amount-input">
                <span className="kt-amount-prefix">£</span>
                <input
                  id="edit-balance"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.currentBalance}
                  onChange={(e) => setEditForm((f) => ({ ...f, currentBalance: e.target.value }))}
                  required
                />
              </div>
            </div>
            {CREDIT_LIMIT_TYPES.has(editForm.debtType) && (
              <div className="kt-field">
                <label htmlFor="edit-credit-limit">Credit limit</label>
                <div className="kt-amount-input">
                  <span className="kt-amount-prefix">£</span>
                  <input
                    id="edit-credit-limit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.creditLimit}
                    onChange={(e) => setEditForm((f) => ({ ...f, creditLimit: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="kt-field">
              <label htmlFor="edit-monthly-payment">Monthly payment</label>
              <div className="kt-amount-input">
                <span className="kt-amount-prefix">£</span>
                <input
                  id="edit-monthly-payment"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.monthlyPayment}
                  onChange={(e) => setEditForm((f) => ({ ...f, monthlyPayment: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="kt-field">
              <label htmlFor="edit-due-day">Payment due day</label>
              <input
                id="edit-due-day"
                type="number"
                min="1"
                max="31"
                value={editForm.paymentDueDay}
                onChange={(e) => setEditForm((f) => ({ ...f, paymentDueDay: e.target.value }))}
                required
              />
            </div>
            <div className="kt-field">
              <label htmlFor="edit-end-date">Expected end date</label>
              <input
                id="edit-end-date"
                type="date"
                value={editForm.expectedEndDate}
                onChange={(e) => setEditForm((f) => ({ ...f, expectedEndDate: e.target.value }))}
              />
            </div>
            <div className="kt-field">
              <label htmlFor="edit-rate-type">Rate type</label>
              <select id="edit-rate-type" value={editForm.rateType} onChange={(e) => setEditForm((f) => ({ ...f, rateType: e.target.value }))}>
                <option value="standard">Standard</option>
                <option value="promotional">Promotional</option>
                <option value="zero">0% / Interest Free</option>
              </select>
            </div>
            {editForm.rateType !== 'zero' && (
              <div className="kt-field">
                <label htmlFor="edit-interest-rate">Interest rate (% APR)</label>
                <input
                  id="edit-interest-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.interestRate}
                  onChange={(e) => setEditForm((f) => ({ ...f, interestRate: e.target.value }))}
                  required
                />
              </div>
            )}
            {editForm.rateType !== 'standard' && (
              <>
                <div className="kt-field">
                  <label htmlFor="edit-promo-end">Promotional end date</label>
                  <input
                    id="edit-promo-end"
                    type="date"
                    value={editForm.promotionalEndDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, promotionalEndDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="kt-field">
                  <label htmlFor="edit-standard-rate">Standard rate after promotion (% APR)</label>
                  <input
                    id="edit-standard-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.standardRateAfterPromo}
                    onChange={(e) => setEditForm((f) => ({ ...f, standardRateAfterPromo: e.target.value }))}
                    required
                  />
                </div>
              </>
            )}
            <div className="kt-field-wide">
              <button className="kt-auth-button" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="kt-category-link-button" onClick={() => setEditing(false)} style={{ marginLeft: 12 }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="kt-debt-summary-grid">
            <div>
              <span className="kt-metric-label">Current balance</span>
              <p className="kt-metric-value">{formatCurrency(debt.current_balance)}</p>
            </div>
            <div>
              <span className="kt-metric-label">Original balance</span>
              <p className="kt-metric-value">{formatCurrency(debt.original_balance)}</p>
            </div>
            <div>
              <span className="kt-metric-label">Monthly payment</span>
              <p className="kt-metric-value">{formatCurrency(debt.monthly_payment)}</p>
            </div>
            <div>
              <span className="kt-metric-label">Next payment due</span>
              <p className="kt-metric-value">{formatDate(debt.next_payment_date)}</p>
            </div>
            {debt.credit_limit != null && (
              <div>
                <span className="kt-metric-label">Credit limit</span>
                <p className="kt-metric-value">{formatCurrency(debt.credit_limit)}</p>
              </div>
            )}
            <div>
              <span className="kt-metric-label">Payment due day</span>
              <p className="kt-metric-value">{debt.payment_due_day}</p>
            </div>
            <div>
              <span className="kt-metric-label">Start date</span>
              <p className="kt-metric-value">{formatDate(debt.start_date)}</p>
            </div>
            {debt.expected_end_date && (
              <div>
                <span className="kt-metric-label">Expected end date</span>
                <p className="kt-metric-value">{formatDate(debt.expected_end_date)}</p>
              </div>
            )}
            <div>
              <span className="kt-metric-label">Interest rate</span>
              <p className="kt-metric-value">
                {Number(debt.interest_rate)}%{' '}
                {debt.rate_type !== 'standard' && `(${debt.rate_type === 'zero' ? '0%' : 'promotional'})`}
              </p>
            </div>
            {debt.promotional_end_date && (
              <div>
                <span className="kt-metric-label">Promotional end date</span>
                <p className="kt-metric-value">{formatDate(debt.promotional_end_date)}</p>
              </div>
            )}
            {debt.standard_rate_after_promo != null && (
              <div>
                <span className="kt-metric-label">Standard rate after promotion</span>
                <p className="kt-metric-value">{Number(debt.standard_rate_after_promo)}%</p>
              </div>
            )}
          </div>
        )}

        {!editing && (
          <div className="kt-debt-progress-track kt-project-progress-track-large" style={{ marginTop: 20 }}>
            <div
              className={`kt-debt-progress-fill kt-debt-progress-${Number(debt.percent_paid) > 50 ? 'good' : Number(debt.percent_paid) >= 25 ? 'amber' : 'bad'}`}
              style={{ width: `${Math.min(100, Number(debt.percent_paid))}%` }}
            />
          </div>
        )}
        {!editing && (
          <p className="kt-panel-subtitle" style={{ marginTop: 8 }}>
            {Number(debt.percent_paid).toFixed(0)}% paid off
          </p>
        )}
      </div>

      {/* Promotional rate warning panel */}
      {debt.promo_expiring_soon && (
        <div className="kt-debt-promo-panel">
          <p>
            <strong>{debt.days_until_promo_ends} days until your promotional rate ends</strong>
          </p>
          <p>
            After {formatDate(debt.promotional_end_date)}, your interest rate will be{' '}
            {Number(debt.standard_rate_after_promo)}%.
          </p>
          {suggestedMonthly != null && (
            <p>To avoid extra interest, aim to pay off {formatCurrency(suggestedMonthly)} per month.</p>
          )}
        </div>
      )}

      {/* Payoff calculator */}
      {!debt.is_paid_off && (
        <div className="kt-dashboard-panel">
          <h2 className="kt-panel-title">Payoff calculator</h2>
          {isDualScenario ? <DualScenarioPanels debt={debt} /> : <SingleScenarioPanel debt={debt} />}
        </div>
      )}

      {/* Balance over time chart */}
      <div className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Balance over time</h2>
        <DebtBalanceChart debt={debt} />
      </div>

      {/* Payment history */}
      <div className="kt-dashboard-panel">
        <div className="kt-debt-detail-summary-header">
          <h2 className="kt-panel-title">Payment history</h2>
          {canManage && !debt.is_paid_off && (
            <button type="button" className="kt-auth-button" onClick={openPaymentModal}>
              Log {termPayment.toLowerCase()}
            </button>
          )}
        </div>
        {debt.payments.length === 0 ? (
          <div className="kt-categories-empty">No payments logged yet.</div>
        ) : (
          <>
            <table className="kt-invoices-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th>Recorded by</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pagedPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.payment_date)}</td>
                    <td>{formatCurrency(p.amount)}</td>
                    <td>{p.notes || '—'}</td>
                    <td>{p.recorded_by_username || '—'}</td>
                    {isAdmin && (
                      <td>
                        {paymentDeleteId === p.id ? (
                          <span>
                            <button
                              type="button"
                              className="kt-category-link-button kt-category-danger"
                              onClick={() => handleDeletePayment(p.id)}
                              disabled={paymentDeleteBusy}
                            >
                              {paymentDeleteBusy ? 'Deleting…' : 'Confirm'}
                            </button>{' '}
                            <button type="button" className="kt-category-link-button" onClick={() => setPaymentDeleteId(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="kt-category-link-button kt-category-danger" onClick={() => setPaymentDeleteId(p.id)}>
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPaymentPages > 1 && (
              <div className="kt-pagination">
                <button type="button" disabled={paymentPage <= 1} onClick={() => setPaymentPage((p) => p - 1)}>
                  ← Previous
                </button>
                <span>
                  Page {paymentPage} of {totalPaymentPages}
                </span>
                <button type="button" disabled={paymentPage >= totalPaymentPages} onClick={() => setPaymentPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Notes */}
      <div className="kt-dashboard-panel">
        <div className="kt-debt-detail-summary-header">
          <h2 className="kt-panel-title">Notes</h2>
          {canManage && !notesEditing && (
            <button type="button" className="kt-category-link-button" onClick={openNotesEdit}>
              Edit
            </button>
          )}
        </div>
        {notesEditing ? (
          <div>
            <textarea
              rows={4}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: 8 }}>
              <button className="kt-auth-button" type="button" onClick={handleNotesSave} disabled={notesSaving}>
                {notesSaving ? 'Saving…' : 'Save notes'}
              </button>
              <button type="button" className="kt-category-link-button" onClick={() => setNotesEditing(false)} style={{ marginLeft: 12 }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="kt-debt-notes-box">{debt.notes || 'No notes yet.'}</div>
        )}
      </div>

      {showPaymentModal && (
        <Modal title={`Log ${termPayment.toLowerCase()}`} onClose={() => setShowPaymentModal(false)}>
          <form onSubmit={handleLogPayment}>
            <div className="kt-field">
              <label>{termDebt}</label>
              <input type="text" value={debt.name} disabled />
            </div>
            <div className="kt-field">
              <label>Current balance</label>
              <input type="text" value={formatCurrency(debt.current_balance)} disabled />
            </div>
            <div className="kt-field">
              <label htmlFor="detail-payment-amount">Amount</label>
              <div className="kt-amount-input">
                <span className="kt-amount-prefix">£</span>
                <input
                  id="detail-payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="kt-field">
              <label htmlFor="detail-payment-date">Date</label>
              <input
                id="detail-payment-date"
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="kt-field kt-field-wide">
              <label htmlFor="detail-payment-notes">Notes</label>
              <textarea
                id="detail-payment-notes"
                rows={2}
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {paymentError && <div className="kt-auth-error">{paymentError}</div>}
            <div className="kt-modal-actions">
              <button type="button" className="kt-category-link-button" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </button>
              <button className="kt-auth-button" type="submit" disabled={paymentSaving}>
                {paymentSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Milestones */}
      {debt.milestones.length > 0 && (
        <div className="kt-dashboard-panel">
          <h2 className="kt-panel-title">Milestones reached</h2>
          <ul className="kt-project-timeline">
            {debt.milestones.map((m) => (
              <li key={m.milestone_percent}>
                <span>{m.milestone_percent}% paid off</span>
                <span>{formatDateTime(m.notified_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
