import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useDebtTerminology } from '../context/DebtTerminologyContext.jsx'
import Modal from '../components/Modal.jsx'
import HelpIconLink from '../components/HelpIconLink.jsx'
import Tooltip from '../components/Tooltip.jsx'
import { debtsApi } from '../utils/api.js'
import {
  addMonthsFromToday,
  estimateDebtPayoffMonths,
  formatCurrency,
  formatDate,
} from '../utils/format.js'
import { DEBT_BADGE_TOOLTIPS, promoWarningTooltip } from '../utils/badgeTooltips.js'

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

const SORT_OPTIONS = [
  { value: 'interest_rate_desc', label: 'Highest interest first' },
  { value: 'interest_rate_asc', label: 'Lowest interest first' },
  { value: 'balance_desc', label: 'Largest balance first' },
  { value: 'balance_asc', label: 'Smallest balance first' },
  { value: 'payment_due', label: 'Next payment due soonest' },
  { value: 'promo_expiring', label: 'Promotional rate expiring soonest' },
  { value: 'recent', label: 'Most recently added' },
]

const emptyForm = {
  name: '',
  debtType: 'credit_card',
  customTypeLabel: '',
  currentBalance: '',
  creditLimit: '',
  monthlyPayment: '',
  paymentDueDay: '',
  startDate: '',
  expectedEndDate: '',
  rateType: 'standard', // 'standard' | 'promotional' | 'zero'
  interestRate: '',
  promotionalEndDate: '',
  standardRateAfterPromo: '',
  notes: '',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function debtTypeLabel(debt) {
  if (debt.debt_type === 'other') return debt.custom_type_label || 'Other'
  return DEBT_TYPE_LABELS[debt.debt_type] || debt.debt_type
}

function progressLevel(percentPaid) {
  const p = Number(percentPaid)
  if (p > 50) return 'good'
  if (p >= 25) return 'amber'
  return 'bad'
}

const PROGRESS_TOOLTIP_BY_LEVEL = {
  good: DEBT_BADGE_TOOLTIPS.progressGood,
  amber: DEBT_BADGE_TOOLTIPS.progressAmber,
  bad: DEBT_BADGE_TOOLTIPS.progressBad,
}

export default function DebtsPage() {
  const { user } = useAuth()
  const token = user?.token
  const canManage = user?.role !== 'readonly'
  const terminology = useDebtTerminology()
  const termModule = terminology.debt_term_module
  const termDebt = terminology.debt_term_debt
  const termPayment = terminology.debt_term_payment
  const termDebtLower = termDebt.toLowerCase()
  const termPaymentLower = termPayment.toLowerCase()

  const [debts, setDebts] = useState([])
  const [sort, setSort] = useState('interest_rate_desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [paymentDebt, setPaymentDebt] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ amount: '', date: todayStr(), notes: '' })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const loadDebts = () => {
    setLoading(true)
    setError('')
    return debtsApi
      .list(sort, token)
      .then(setDebts)
      .catch((err) => setError(err.message || `Failed to load ${termDebtLower}s`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDebts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sort])

  const activeDebts = useMemo(() => debts.filter((d) => !d.is_paid_off), [debts])
  const paidOffDebts = useMemo(() => debts.filter((d) => d.is_paid_off), [debts])

  const totalDebt = useMemo(
    () => activeDebts.reduce((sum, d) => sum + Number(d.current_balance), 0),
    [activeDebts]
  )
  const monthlyPayments = useMemo(
    () => activeDebts.reduce((sum, d) => sum + Number(d.monthly_payment), 0),
    [activeDebts]
  )

  const resetForm = () => {
    setForm(emptyForm)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const isPromo = form.rateType !== 'standard'
      const payload = {
        name: form.name.trim(),
        debt_type: form.debtType,
        custom_type_label: form.debtType === 'other' ? form.customTypeLabel.trim() || null : null,
        current_balance: Number(form.currentBalance),
        credit_limit: form.creditLimit ? Number(form.creditLimit) : null,
        monthly_payment: Number(form.monthlyPayment),
        payment_due_day: Number(form.paymentDueDay),
        start_date: form.startDate,
        expected_end_date: form.expectedEndDate || null,
        interest_rate: form.rateType === 'zero' ? 0 : Number(form.interestRate),
        rate_type: form.rateType,
        promotional_end_date: isPromo ? form.promotionalEndDate : null,
        standard_rate_after_promo: isPromo && form.standardRateAfterPromo ? Number(form.standardRateAfterPromo) : null,
        notes: form.notes.trim() || null,
      }
      await debtsApi.create(payload, token)
      resetForm()
      await loadDebts()
    } catch (err) {
      setError(err.message || `Failed to save ${termDebtLower}`)
    } finally {
      setSaving(false)
    }
  }

  const openPaymentModal = (debt) => {
    setPaymentError('')
    setPaymentDebt(debt)
    setPaymentForm({ amount: String(debt.monthly_payment), date: todayStr(), notes: '' })
  }

  const closePaymentModal = () => {
    setPaymentDebt(null)
    setPaymentForm({ amount: '', date: todayStr(), notes: '' })
  }

  const handleLogPayment = async (e) => {
    e.preventDefault()
    if (!paymentDebt) return
    setPaymentError('')
    setPaymentSaving(true)
    try {
      await debtsApi.addPayment(
        paymentDebt.id,
        {
          amount: Number(paymentForm.amount),
          payment_date: paymentForm.date,
          notes: paymentForm.notes.trim() || null,
        },
        token
      )
      closePaymentModal()
      await loadDebts()
    } catch (err) {
      setPaymentError(err.message || `Failed to log ${termPaymentLower}`)
    } finally {
      setPaymentSaving(false)
    }
  }

  const preview = estimateDebtPayoffMonths(
    form.currentBalance,
    form.rateType === 'zero' ? 0 : form.interestRate,
    form.monthlyPayment
  )

  if (loading && debts.length === 0) {
    return <p className="kt-page-subtitle">Loading {termDebtLower}s…</p>
  }

  return (
    <div>
      <div className="kt-page-header">
        <h1 className="kt-page-title">{termModule}</h1>
        <p className="kt-page-subtitle">Track balances, payments, and payoff timelines for every {termDebtLower}.</p>
        <HelpIconLink topic="debt-tracking" />
      </div>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="kt-metric-row">
        <div className="kt-metric-card kt-debt-metric-total">
          <span className="kt-metric-label">Total {termDebtLower}</span>
          <span className="kt-metric-value">{formatCurrency(totalDebt)}</span>
        </div>
        <div className="kt-metric-card kt-debt-metric-monthly">
          <span className="kt-metric-label">Monthly payments due</span>
          <span className="kt-metric-value">{formatCurrency(monthlyPayments)}</span>
        </div>
        <div className="kt-metric-card">
          <span className="kt-metric-label">Active {termDebtLower}s</span>
          <span className="kt-metric-value">{activeDebts.length}</span>
        </div>
      </div>

      <div className="kt-debts-toolbar">
        <div className="kt-field kt-debts-sort">
          <label htmlFor="debts-sort">Sort by</label>
          <select id="debts-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {canManage && (
          <button
            type="button"
            className="kt-auth-button kt-categories-add-button"
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
          >
            {showForm ? 'Cancel' : `+ Add ${termDebtLower}`}
          </button>
        )}
      </div>

      {showForm && (
        <form className="kt-project-form kt-debt-form" onSubmit={handleSubmit}>
          <h3 className="kt-debt-form-section-title kt-field-wide">Basic details</h3>
          <div className="kt-field">
            <label htmlFor="debt-name">Name</label>
            <input
              id="debt-name"
              type="text"
              value={form.name}
              maxLength={255}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field">
            <label htmlFor="debt-type">Type</label>
            <select
              id="debt-type"
              value={form.debtType}
              onChange={(e) => setForm((f) => ({ ...f, debtType: e.target.value }))}
            >
              {Object.entries(DEBT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {form.debtType === 'other' && (
            <div className="kt-field">
              <label htmlFor="debt-custom-type">Custom type label</label>
              <input
                id="debt-custom-type"
                type="text"
                maxLength={100}
                value={form.customTypeLabel}
                onChange={(e) => setForm((f) => ({ ...f, customTypeLabel: e.target.value }))}
                required
              />
            </div>
          )}
          <div className="kt-field">
            <label htmlFor="debt-balance">Current balance</label>
            <div className="kt-amount-input">
              <span className="kt-amount-prefix">£</span>
              <input
                id="debt-balance"
                type="number"
                step="0.01"
                min="0"
                value={form.currentBalance}
                onChange={(e) => setForm((f) => ({ ...f, currentBalance: e.target.value }))}
                required
              />
            </div>
          </div>
          {CREDIT_LIMIT_TYPES.has(form.debtType) && (
            <div className="kt-field">
              <label htmlFor="debt-credit-limit">Credit limit</label>
              <div className="kt-amount-input">
                <span className="kt-amount-prefix">£</span>
                <input
                  id="debt-credit-limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                />
              </div>
            </div>
          )}
          <div className="kt-field kt-field-wide">
            <label htmlFor="debt-notes">Notes</label>
            <textarea
              id="debt-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <h3 className="kt-debt-form-section-title kt-field-wide">Payment details</h3>
          <div className="kt-field">
            <label htmlFor="debt-monthly-payment">Monthly payment</label>
            <div className="kt-amount-input">
              <span className="kt-amount-prefix">£</span>
              <input
                id="debt-monthly-payment"
                type="number"
                step="0.01"
                min="0.01"
                value={form.monthlyPayment}
                onChange={(e) => setForm((f) => ({ ...f, monthlyPayment: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="kt-field">
            <label htmlFor="debt-due-day">Payment due day</label>
            <input
              id="debt-due-day"
              type="number"
              min="1"
              max="31"
              value={form.paymentDueDay}
              onChange={(e) => setForm((f) => ({ ...f, paymentDueDay: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field">
            <label htmlFor="debt-start-date">Start date</label>
            <input
              id="debt-start-date"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field">
            <label htmlFor="debt-end-date">Expected end date</label>
            <input
              id="debt-end-date"
              type="date"
              value={form.expectedEndDate}
              onChange={(e) => setForm((f) => ({ ...f, expectedEndDate: e.target.value }))}
            />
          </div>

          <h3 className="kt-debt-form-section-title kt-field-wide">Interest rate</h3>
          <div className="kt-field">
            <label htmlFor="debt-rate-type">Rate type</label>
            <select
              id="debt-rate-type"
              value={form.rateType}
              onChange={(e) => setForm((f) => ({ ...f, rateType: e.target.value }))}
            >
              <option value="standard">Standard</option>
              <option value="promotional">Promotional</option>
              <option value="zero">0% / Interest Free</option>
            </select>
          </div>
          {form.rateType !== 'zero' && (
            <div className="kt-field">
              <label htmlFor="debt-interest-rate">Interest rate (% APR)</label>
              <input
                id="debt-interest-rate"
                type="number"
                step="0.01"
                min="0"
                value={form.interestRate}
                onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
                required
              />
            </div>
          )}
          {form.rateType !== 'standard' && (
            <>
              <div className="kt-field">
                <label htmlFor="debt-promo-end">Promotional end date</label>
                <input
                  id="debt-promo-end"
                  type="date"
                  value={form.promotionalEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, promotionalEndDate: e.target.value }))}
                  required
                />
              </div>
              <div className="kt-field">
                <label htmlFor="debt-standard-rate">Standard rate after promotion (% APR)</label>
                <input
                  id="debt-standard-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.standardRateAfterPromo}
                  onChange={(e) => setForm((f) => ({ ...f, standardRateAfterPromo: e.target.value }))}
                  required
                />
              </div>
            </>
          )}

          {preview && (
            <div className="kt-field-wide">
              {preview.warning ? (
                <p className="kt-debt-preview-warning">
                  Your monthly payment does not cover the interest at this rate — the balance would grow
                  instead of shrinking.
                </p>
              ) : (
                <p className="kt-debt-preview">
                  Based on these details, this {termDebtLower} will be paid off in approximately{' '}
                  {preview.months} month{preview.months === 1 ? '' : 's'} ({addMonthsFromToday(preview.months)}).
                </p>
              )}
            </div>
          )}

          <button className="kt-auth-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : `Add ${termDebtLower}`}
          </button>
        </form>
      )}

      {activeDebts.length === 0 ? (
        <div className="kt-categories-empty">
          No active {termDebtLower}s yet. Add one to start tracking its payoff.
        </div>
      ) : (
        <ul className="kt-debt-list">
          {activeDebts.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              termPaymentLower={termPaymentLower}
              canManage={canManage}
              onLogPayment={() => openPaymentModal(debt)}
            />
          ))}
        </ul>
      )}

      <details className="kt-debt-paidoff-section">
        <summary>
          Paid off {termDebtLower}s ({paidOffDebts.length})
        </summary>
        {paidOffDebts.length === 0 ? (
          <div className="kt-categories-empty">No paid off {termDebtLower}s yet.</div>
        ) : (
          <ul className="kt-debt-list">
            {paidOffDebts.map((debt) => (
              <li key={debt.id} className="kt-debt-card kt-debt-card-paidoff">
                <div className="kt-debt-card-header">
                  <h3 className="kt-debt-name">
                    <span className="kt-debt-paidoff-tick" aria-hidden="true">✓</span>{' '}
                    <Link to={`/debts/${debt.id}`}>{debt.name}</Link>
                  </h3>
                  <span className="kt-debt-type-badge">{debtTypeLabel(debt)}</span>
                </div>
                <p className="kt-panel-subtitle">
                  Paid off on {debt.paid_off_date ? formatDate(debt.paid_off_date) : 'unknown date'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </details>

      {paymentDebt && (
        <Modal title={`Log ${termPaymentLower}`} onClose={closePaymentModal}>
          <form onSubmit={handleLogPayment}>
            <div className="kt-field">
              <label>{termDebt}</label>
              <input type="text" value={paymentDebt.name} disabled />
            </div>
            <div className="kt-field">
              <label>Current balance</label>
              <input type="text" value={formatCurrency(paymentDebt.current_balance)} disabled />
            </div>
            <div className="kt-field">
              <label htmlFor="payment-amount">Amount</label>
              <div className="kt-amount-input">
                <span className="kt-amount-prefix">£</span>
                <input
                  id="payment-amount"
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
              <label htmlFor="payment-date">Date</label>
              <input
                id="payment-date"
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="kt-field kt-field-wide">
              <label htmlFor="payment-notes">Notes</label>
              <textarea
                id="payment-notes"
                rows={2}
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {paymentError && <div className="kt-auth-error">{paymentError}</div>}
            <div className="kt-modal-actions">
              <button type="button" className="kt-category-link-button" onClick={closePaymentModal}>
                Cancel
              </button>
              <button className="kt-auth-button" type="submit" disabled={paymentSaving}>
                {paymentSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function DebtCard({ debt, termPaymentLower, canManage, onLogPayment }) {
  const level = progressLevel(debt.percent_paid)
  const percentPaid = Math.min(100, Math.max(0, Number(debt.percent_paid)))

  return (
    <li className="kt-debt-card">
      {debt.promo_expiring_soon && (
        <Tooltip
          content={promoWarningTooltip(debt.days_until_promo_ends, debt.standard_rate_after_promo)}
          className="kt-tooltip-wrap-block"
        >
          <div className="kt-debt-promo-warning">
            Promotional rate expires in {debt.days_until_promo_ends} day{debt.days_until_promo_ends === 1 ? '' : 's'}
          </div>
        </Tooltip>
      )}
      <div className="kt-debt-card-header">
        <h3 className="kt-debt-name">
          <Link to={`/debts/${debt.id}`}>{debt.name}</Link>
        </h3>
        <span className="kt-debt-type-badge">{debtTypeLabel(debt)}</span>
      </div>

      <div className="kt-debt-balance">{formatCurrency(debt.current_balance)}</div>

      <InterestRateDisplay debt={debt} />

      <div className="kt-debt-meta">
        <span>
          Monthly payment: <strong>{formatCurrency(debt.monthly_payment)}</strong>
        </span>
        <span>
          Next payment due: <strong>{formatDate(debt.next_payment_date)}</strong>
        </span>
      </div>

      <Tooltip content={PROGRESS_TOOLTIP_BY_LEVEL[level]} className="kt-tooltip-wrap-block">
        <div className="kt-debt-progress-track">
          <div className={`kt-debt-progress-fill kt-debt-progress-${level}`} style={{ width: `${percentPaid}%` }} />
        </div>
      </Tooltip>
      <p className="kt-panel-subtitle" style={{ marginTop: 4 }}>
        {percentPaid.toFixed(0)}% paid off
      </p>

      <div className="kt-category-actions kt-debt-card-actions">
        <Link to={`/debts/${debt.id}`} className="kt-category-link-button">
          View details
        </Link>
        {canManage && (
          <button type="button" className="kt-auth-button kt-debt-log-payment-button" onClick={onLogPayment}>
            Log {termPaymentLower}
          </button>
        )}
      </div>
    </li>
  )
}

function InterestRateDisplay({ debt }) {
  if (debt.rate_type === 'standard') {
    return <div className="kt-debt-rate">{Number(debt.interest_rate)}% APR</div>
  }
  const label = debt.rate_type === 'zero' ? '0% until' : `${Number(debt.interest_rate)}% promotional until`
  return (
    <div className="kt-debt-rate kt-debt-rate-promo">
      {label} {formatDate(debt.promotional_end_date)}
      {debt.days_until_promo_ends != null && debt.days_until_promo_ends >= 0 && (
        <span className="kt-debt-rate-countdown">
          {' '}
          · {debt.days_until_promo_ends} day{debt.days_until_promo_ends === 1 ? '' : 's'} remaining
        </span>
      )}
    </div>
  )
}
