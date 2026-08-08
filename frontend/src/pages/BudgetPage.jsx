import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useModules } from '../context/ModulesContext.jsx'
import { useBudgetTerminology } from '../context/BudgetTerminologyContext.jsx'
import Modal from '../components/Modal.jsx'
import HelpIconLink from '../components/HelpIconLink.jsx'
import Tooltip from '../components/Tooltip.jsx'
import { budgetsApi, categoriesApi, projectsApi, savingsGoalsApi } from '../utils/api.js'
import { formatCurrency, formatDate, monthsInFinancialYear, MONTH_NAMES } from '../utils/format.js'
import { BUDGET_BADGE_TOOLTIPS } from '../utils/badgeTooltips.js'

const VIEW_MODE_KEY = 'keeptrack-budget-view-mode'
const FY_OPTION_LABELS = ['Current', 'Next', 'Year after next']

const STATUS_LEVEL = { under_budget: 'good', warning: 'amber', over_budget: 'bad' }
const STATUS_LABEL = { under_budget: 'On Track', warning: 'Warning', over_budget: 'Over Budget' }
const STATUS_TOOLTIP = {
  under_budget: BUDGET_BADGE_TOOLTIPS.onTrack,
  warning: BUDGET_BADGE_TOOLTIPS.warning,
  over_budget: BUDGET_BADGE_TOOLTIPS.overBudget,
}

function statusLevel(status) {
  return STATUS_LEVEL[status] || 'good'
}

function readStoredViewMode(fallback) {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) || fallback
  } catch {
    return fallback
  }
}

function writeStoredViewMode(mode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    // private browsing / storage disabled — view choice just won't persist
  }
}

function todayMonthStr() {
  return new Date().toISOString().slice(0, 7)
}

const emptyBudgetForm = {
  categoryId: '',
  annualAmount: '',
  overridesOpen: false,
  overrides: {},
}

const emptyGoalForm = {
  name: '',
  description: '',
  targetAmount: '',
  targetMonth: todayMonthStr(),
  categoryId: '',
}

export default function BudgetPage() {
  const { user } = useAuth()
  const token = user?.token
  const { isEnabled } = useModules()
  const terminology = useBudgetTerminology()
  const termModule = terminology.budget_term_module
  const termBudget = terminology.budget_term_budget
  const termBudgetLower = termBudget.toLowerCase()
  const termGoal = terminology.budget_term_savings_goal
  const termGoalLower = termGoal.toLowerCase()

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canManage = user?.role !== 'readonly'
  const personalFinanceMode = isEnabled('debt_tracking')

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'savings-goals' ? 'savings-goals' : 'budgets'
  const setActiveTab = (tab) => setSearchParams(tab === 'budgets' ? {} : { tab })

  // --- Budgets tab state -----------------------------------------------
  const [financialYears, setFinancialYears] = useState([])
  const [selectedFYId, setSelectedFYId] = useState(null)
  const [budgetsData, setBudgetsData] = useState(null)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState(() => readStoredViewMode(personalFinanceMode ? 'card' : 'table'))

  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetForm, setBudgetForm] = useState(emptyBudgetForm)
  const [budgetFormSaving, setBudgetFormSaving] = useState(false)
  const [budgetFormError, setBudgetFormError] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState(null)

  const [detailBudget, setDetailBudget] = useState(null)
  const [deletingBudget, setDeletingBudget] = useState(false)
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState(false)

  const selectedFY = useMemo(
    () => financialYears.find((fy) => fy.id === selectedFYId) || null,
    [financialYears, selectedFYId]
  )

  const loadBudgets = (fyId) => {
    setLoading(true)
    setError('')
    return budgetsApi
      .list(fyId, token)
      .then((data) => {
        setBudgetsData(data)
        setSelectedFYId((prev) => prev ?? data.financial_year_id)
      })
      .catch((err) => setError(err.message || `Failed to load ${termBudgetLower}s`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!token) return
    Promise.all([projectsApi.financialYears(token), categoriesApi.list(token)])
      .then(([years, cats]) => {
        setFinancialYears(years)
        setCategories(cats)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (!token) return
    loadBudgets(selectedFYId || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedFYId])

  const changeViewMode = (mode) => {
    setViewMode(mode)
    writeStoredViewMode(mode)
  }

  const budgetedCategoryIds = useMemo(
    () => new Set((budgetsData?.budgets || []).map((b) => b.category_id)),
    [budgetsData]
  )

  const sortedFormCategories = useMemo(() => {
    const unbudgeted = categories.filter((c) => !budgetedCategoryIds.has(c.id))
    const budgeted = categories.filter((c) => budgetedCategoryIds.has(c.id))
    return [...unbudgeted, ...budgeted]
  }, [categories, budgetedCategoryIds])

  const resetBudgetForm = () => {
    setBudgetForm(emptyBudgetForm)
    setShowBudgetForm(false)
    setEditingCategoryId(null)
    setBudgetFormError('')
  }

  const defaultOverrides = (annualAmount) => {
    const monthly = annualAmount ? (Number(annualAmount) / 12).toFixed(2) : ''
    const out = {}
    for (let m = 1; m <= 12; m++) out[m] = monthly
    return out
  }

  const openAddForm = (categoryId) => {
    setBudgetFormError('')
    setEditingCategoryId(null)
    setBudgetForm({
      categoryId: categoryId ? String(categoryId) : '',
      annualAmount: '',
      overridesOpen: false,
      overrides: defaultOverrides(''),
    })
    setShowBudgetForm(true)
  }

  const openEditForm = (budget) => {
    setBudgetFormError('')
    setEditingCategoryId(budget.category_id)
    const hasOverrides = budget.monthly_amounts && Object.keys(budget.monthly_amounts).length > 0
    const overrides = defaultOverrides(budget.annual_amount)
    if (hasOverrides) {
      for (const [month, amount] of Object.entries(budget.monthly_amounts)) {
        overrides[month] = String(amount)
      }
    }
    setBudgetForm({
      categoryId: String(budget.category_id),
      annualAmount: String(budget.annual_amount),
      overridesOpen: Boolean(hasOverrides),
      overrides,
    })
    setShowBudgetForm(true)
    setDetailBudget(null)
  }

  const handleAnnualAmountChange = (value) => {
    setBudgetForm((f) => ({
      ...f,
      annualAmount: value,
      overrides: f.overridesOpen ? f.overrides : defaultOverrides(value),
    }))
  }

  const handleToggleOverrides = () => {
    setBudgetForm((f) => ({
      ...f,
      overridesOpen: !f.overridesOpen,
      overrides: !f.overridesOpen && Object.values(f.overrides).every((v) => v === '') ? defaultOverrides(f.annualAmount) : f.overrides,
    }))
  }

  const handleBudgetSubmit = async (e) => {
    e.preventDefault()
    setBudgetFormError('')
    setBudgetFormSaving(true)
    try {
      const payload = {
        category_id: Number(budgetForm.categoryId),
        financial_year_id: selectedFYId,
        annual_amount: Number(budgetForm.annualAmount),
        monthly_amounts: budgetForm.overridesOpen
          ? Object.fromEntries(Object.entries(budgetForm.overrides).map(([m, v]) => [m, Number(v)]))
          : null,
      }
      await budgetsApi.upsert(payload, token)
      resetBudgetForm()
      await loadBudgets(selectedFYId)
    } catch (err) {
      setBudgetFormError(err.message || `Failed to save ${termBudgetLower}`)
    } finally {
      setBudgetFormSaving(false)
    }
  }

  const handleDeleteBudget = async () => {
    if (!detailBudget) return
    setDeletingBudget(true)
    try {
      await budgetsApi.remove(detailBudget.id, token)
      setDetailBudget(null)
      setConfirmDeleteBudget(false)
      await loadBudgets(selectedFYId)
    } catch (err) {
      setError(err.message || `Failed to remove ${termBudgetLower}`)
    } finally {
      setDeletingBudget(false)
    }
  }

  const monthOrder = selectedFY ? monthsInFinancialYear(selectedFY) : []

  return (
    <div>
      <div className="kt-page-header">
        <h1 className="kt-page-title">{termModule}</h1>
        <p className="kt-page-subtitle">
          Track {termBudgetLower}s against actual spend, and save toward {termGoalLower}s.
        </p>
        <HelpIconLink topic="budget-planning" />
      </div>

      <div className="kt-budget-tabs">
        <button
          type="button"
          className={`kt-budget-tab${activeTab === 'budgets' ? ' active' : ''}`}
          onClick={() => setActiveTab('budgets')}
        >
          {termBudget}s
        </button>
        <button
          type="button"
          className={`kt-budget-tab${activeTab === 'savings-goals' ? ' active' : ''}`}
          onClick={() => setActiveTab('savings-goals')}
        >
          {termGoal}s
        </button>
      </div>

      {activeTab === 'budgets' ? (
        <BudgetsTab
          termBudget={termBudget}
          termBudgetLower={termBudgetLower}
          isAdmin={isAdmin}
          financialYears={financialYears}
          selectedFYId={selectedFYId}
          setSelectedFYId={setSelectedFYId}
          budgetsData={budgetsData}
          loading={loading}
          error={error}
          viewMode={viewMode}
          changeViewMode={changeViewMode}
          showBudgetForm={showBudgetForm}
          budgetForm={budgetForm}
          setBudgetForm={setBudgetForm}
          budgetFormSaving={budgetFormSaving}
          budgetFormError={budgetFormError}
          editingCategoryId={editingCategoryId}
          sortedFormCategories={sortedFormCategories}
          openAddForm={openAddForm}
          openEditForm={openEditForm}
          resetBudgetForm={resetBudgetForm}
          handleAnnualAmountChange={handleAnnualAmountChange}
          handleToggleOverrides={handleToggleOverrides}
          handleBudgetSubmit={handleBudgetSubmit}
          detailBudget={detailBudget}
          setDetailBudget={setDetailBudget}
          monthOrder={monthOrder}
          confirmDeleteBudget={confirmDeleteBudget}
          setConfirmDeleteBudget={setConfirmDeleteBudget}
          deletingBudget={deletingBudget}
          handleDeleteBudget={handleDeleteBudget}
        />
      ) : (
        <SavingsGoalsTab
          token={token}
          termGoal={termGoal}
          termGoalLower={termGoalLower}
          isAdmin={isAdmin}
          canManage={canManage}
          categories={categories}
        />
      )}
    </div>
  )
}

function BudgetsTab({
  termBudget,
  termBudgetLower,
  isAdmin,
  financialYears,
  selectedFYId,
  setSelectedFYId,
  budgetsData,
  loading,
  error,
  viewMode,
  changeViewMode,
  showBudgetForm,
  budgetForm,
  setBudgetForm,
  budgetFormSaving,
  budgetFormError,
  editingCategoryId,
  sortedFormCategories,
  openAddForm,
  openEditForm,
  resetBudgetForm,
  handleAnnualAmountChange,
  handleToggleOverrides,
  handleBudgetSubmit,
  detailBudget,
  setDetailBudget,
  monthOrder,
  confirmDeleteBudget,
  setConfirmDeleteBudget,
  deletingBudget,
  handleDeleteBudget,
}) {
  const budgets = budgetsData?.budgets || []
  const unbudgeted = budgetsData?.unbudgeted_categories || []

  return (
    <div>
      <div className="kt-budget-toolbar">
        <div className="kt-field kt-budget-fy-select">
          <label htmlFor="budget-fy">Financial year</label>
          <select
            id="budget-fy"
            value={selectedFYId || ''}
            onChange={(e) => setSelectedFYId(Number(e.target.value))}
          >
            {financialYears.map((fy, idx) => (
              <option key={fy.id} value={fy.id}>
                {FY_OPTION_LABELS[idx] || fy.label} — {fy.label}
              </option>
            ))}
          </select>
        </div>
        <div className="kt-budget-toolbar-actions">
          <div className="kt-budget-view-toggle">
            <button
              type="button"
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => changeViewMode('table')}
            >
              Table view
            </button>
            <button
              type="button"
              className={viewMode === 'card' ? 'active' : ''}
              onClick={() => changeViewMode('card')}
            >
              Card view
            </button>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="kt-auth-button kt-categories-add-button"
              onClick={() => (showBudgetForm ? resetBudgetForm() : openAddForm())}
            >
              {showBudgetForm ? 'Cancel' : `+ Set ${termBudgetLower}`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {isAdmin && showBudgetForm && (
        <BudgetForm
          termBudget={termBudget}
          budgetForm={budgetForm}
          setBudgetForm={setBudgetForm}
          categories={sortedFormCategories}
          editing={editingCategoryId != null}
          saving={budgetFormSaving}
          error={budgetFormError}
          onAnnualAmountChange={handleAnnualAmountChange}
          onToggleOverrides={handleToggleOverrides}
          onSubmit={handleBudgetSubmit}
          onCancel={resetBudgetForm}
        />
      )}

      {loading && budgets.length === 0 ? (
        <p className="kt-page-subtitle">Loading {termBudgetLower}s…</p>
      ) : budgets.length === 0 ? (
        <div className="kt-categories-empty">
          No {termBudgetLower}s set for {budgetsData?.financial_year_label || 'this year'} yet.
        </div>
      ) : viewMode === 'table' ? (
        <BudgetTable budgets={budgets} onRowClick={setDetailBudget} />
      ) : (
        <BudgetCards budgets={budgets} onCardClick={setDetailBudget} />
      )}

      {unbudgeted.length > 0 && (
        <div>
          <h2 className="kt-panel-title" style={{ marginTop: 8 }}>
            Unbudgeted categories
          </h2>
          <p className="kt-panel-subtitle">These categories have spending but no {termBudgetLower} set:</p>
          <ul className="kt-budget-unbudgeted-list">
            {unbudgeted.map((c) => (
              <li key={c.category_id} className="kt-budget-unbudgeted-row">
                <span className="kt-budget-row-category">
                  <span className="kt-category-swatch" style={{ background: c.category_colour }} aria-hidden="true" />
                  {c.category_name}
                </span>
                <span>Spent so far: {formatCurrency(c.actual_spend_ytd)}</span>
                {isAdmin && (
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={() => openAddForm(c.category_id)}
                  >
                    Set {termBudgetLower}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detailBudget && (
        <Modal
          title={`${detailBudget.category_name} — ${termBudget} detail`}
          onClose={() => { setDetailBudget(null); setConfirmDeleteBudget(false) }}
          className="kt-budget-month-modal"
        >
          <p className="kt-panel-subtitle">
            Annual {termBudgetLower}: <strong>{formatCurrency(detailBudget.annual_amount)}</strong>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-budget-month-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Budget</th>
                  <th>Actual</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monthOrder.map(({ year, month }) => {
                  const key = String(month)
                  const monthBudget = Number(detailBudget.monthly_budget[key] || 0)
                  const monthActual = Number(detailBudget.actual_spend_by_month[key] || 0)
                  const variance = Number(detailBudget.variance_by_month[key] || 0)
                  const percent = monthBudget ? (monthActual / monthBudget) * 100 : 0
                  const status = percent >= 100 ? 'over_budget' : percent >= 80 ? 'warning' : 'under_budget'
                  return (
                    <tr key={`${year}-${month}`}>
                      <td>{MONTH_NAMES[month - 1]} {year}</td>
                      <td>{formatCurrency(monthBudget)}</td>
                      <td>{formatCurrency(monthActual)}</td>
                      <td>{formatCurrency(variance)}</td>
                      <td>
                        <Tooltip content={STATUS_TOOLTIP[status]}>
                          <span className={`kt-budget-status-badge kt-budget-status-badge-${statusLevel(status)}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="kt-modal-actions">
            {isAdmin && (
              <>
                <button type="button" className="kt-category-link-button" onClick={() => openEditForm(detailBudget)}>
                  Edit {termBudgetLower}
                </button>
                {confirmDeleteBudget ? (
                  <>
                    <span className="kt-category-confirm-text">Remove this {termBudgetLower}?</span>
                    <button
                      type="button"
                      className="kt-category-link-button kt-category-danger"
                      onClick={handleDeleteBudget}
                      disabled={deletingBudget}
                    >
                      {deletingBudget ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button type="button" className="kt-category-link-button" onClick={() => setConfirmDeleteBudget(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="kt-category-link-button kt-category-danger"
                    onClick={() => setConfirmDeleteBudget(true)}
                  >
                    Remove {termBudgetLower}
                  </button>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function BudgetForm({ termBudget, budgetForm, categories, editing, saving, error, onAnnualAmountChange, onToggleOverrides, onSubmit, onCancel, setBudgetForm }) {
  return (
    <form className="kt-project-form kt-debt-form" onSubmit={onSubmit} style={{ marginBottom: 24 }}>
      <div className="kt-field">
        <label htmlFor="budget-category">Category</label>
        <select
          id="budget-category"
          value={budgetForm.categoryId}
          onChange={(e) => setBudgetForm((f) => ({ ...f, categoryId: e.target.value }))}
          disabled={editing}
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="kt-field">
        <label htmlFor="budget-annual">Annual {termBudget.toLowerCase()} (£)</label>
        <div className="kt-amount-input">
          <span className="kt-amount-prefix">£</span>
          <input
            id="budget-annual"
            type="number"
            step="0.01"
            min="0.01"
            value={budgetForm.annualAmount}
            onChange={(e) => onAnnualAmountChange(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="kt-field kt-field-wide">
        <button type="button" className="kt-category-link-button" onClick={onToggleOverrides}>
          {budgetForm.overridesOpen ? 'Hide monthly overrides' : 'Set monthly overrides'}
        </button>
      </div>

      {budgetForm.overridesOpen && (
        <div className="kt-field kt-field-wide">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {MONTH_NAMES.map((name, idx) => {
              const month = idx + 1
              return (
                <div key={month} className="kt-field">
                  <label htmlFor={`budget-override-${month}`}>{name}</label>
                  <div className="kt-amount-input">
                    <span className="kt-amount-prefix">£</span>
                    <input
                      id={`budget-override-${month}`}
                      className="kt-budget-month-override-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={budgetForm.overrides[month] ?? ''}
                      onChange={(e) =>
                        setBudgetForm((f) => ({ ...f, overrides: { ...f.overrides, [month]: e.target.value } }))
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {error && <div className="kt-auth-error kt-field-wide">{error}</div>}

      <div className="kt-modal-actions kt-field-wide" style={{ justifyContent: 'flex-start' }}>
        <button className="kt-auth-button" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="kt-category-link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function BudgetTable({ budgets, onRowClick }) {
  return (
    <div className="kt-budget-table">
      <div className="kt-budget-table-header">
        <span>Category</span>
        <span className="kt-align-right">Annual budget</span>
        <span className="kt-align-right">Spent to date</span>
        <span className="kt-align-right">Remaining</span>
        <span className="kt-align-right">% used</span>
        <span className="kt-align-right">Status</span>
      </div>
      {budgets.map((b) => {
        const level = statusLevel(b.status)
        const percent = Math.min(100, Math.max(0, Number(b.percent_used)))
        return (
          <div key={b.id} className="kt-budget-row" onClick={() => onRowClick(b)}>
            <div className="kt-budget-row-cells">
              <span className="kt-budget-row-category">
                <span className="kt-category-swatch" style={{ background: b.category_colour }} aria-hidden="true" />
                {b.category_name}
              </span>
              <span className="kt-align-right">{formatCurrency(b.annual_amount)}</span>
              <span className="kt-align-right">{formatCurrency(b.ytd_actual)}</span>
              <span className="kt-align-right">{formatCurrency(b.ytd_variance)}</span>
              <span className={`kt-align-right kt-budget-percent-${level}`}>{Number(b.percent_used).toFixed(0)}%</span>
              <span className="kt-align-right">
                <Tooltip content={STATUS_TOOLTIP[b.status]}>
                  <span className={`kt-budget-status-badge kt-budget-status-badge-${level}`}>{STATUS_LABEL[b.status]}</span>
                </Tooltip>
              </span>
            </div>
            <div className="kt-budget-row-progress">
              <div className="kt-debt-progress-track">
                <div className={`kt-debt-progress-fill kt-debt-progress-${level}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BudgetCards({ budgets, onCardClick }) {
  return (
    <div className="kt-budget-cards">
      {budgets.map((b) => {
        const level = statusLevel(b.status)
        const percent = Math.min(100, Math.max(0, Number(b.percent_used)))
        return (
          <div key={b.id} className="kt-budget-card" onClick={() => onCardClick(b)}>
            <div className="kt-budget-card-header">
              <span className="kt-budget-card-title">
                <span className="kt-category-swatch" style={{ background: b.category_colour }} aria-hidden="true" />
                {b.category_name}
              </span>
              <Tooltip content={STATUS_TOOLTIP[b.status]}>
                <span className={`kt-budget-status-badge kt-budget-status-badge-${level}`}>{STATUS_LABEL[b.status]}</span>
              </Tooltip>
            </div>
            <div className="kt-budget-card-amounts">
              <strong>{formatCurrency(b.ytd_actual)}</strong>
              of {formatCurrency(b.annual_amount)} budgeted
            </div>
            <div className="kt-budget-card-gauge-track">
              <div className={`kt-debt-progress-fill kt-debt-progress-${level}`} style={{ width: `${percent}%` }} />
            </div>
            <div className="kt-budget-card-footer">
              <span>{Number(b.percent_used).toFixed(0)}% used</span>
              <span>{formatCurrency(b.ytd_variance)} remaining</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Savings Goals tab ---------------------------------------------------

function monthsRemainingLabel(months) {
  if (months <= 0) return 'Due now'
  return `${months} month${months === 1 ? '' : 's'} remaining`
}

function SavingsGoalsTab({ token, termGoal, termGoalLower, isAdmin, canManage, categories }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [form, setForm] = useState(emptyGoalForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [contributeGoal, setContributeGoal] = useState(null)
  const [contributeForm, setContributeForm] = useState({ amount: '', notes: '' })
  const [contributeSaving, setContributeSaving] = useState(false)
  const [contributeError, setContributeError] = useState('')

  const [confirmCancelId, setConfirmCancelId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadGoals = () => {
    setLoading(true)
    setError('')
    return savingsGoalsApi
      .list(token)
      .then(setGoals)
      .catch((err) => setError(err.message || `Failed to load ${termGoalLower}s`))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!token) return
    loadGoals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])
  const completedGoals = useMemo(() => goals.filter((g) => g.status === 'completed'), [goals])

  const resetForm = () => {
    setForm(emptyGoalForm)
    setShowForm(false)
    setEditingGoal(null)
    setFormError('')
  }

  const openAddForm = () => {
    resetForm()
    setShowForm(true)
  }

  const openEditForm = (goal) => {
    setEditingGoal(goal)
    setForm({
      name: goal.name,
      description: goal.description || '',
      targetAmount: String(goal.target_amount),
      targetMonth: goal.target_date.slice(0, 7),
      categoryId: goal.category_id ? String(goal.category_id) : '',
    })
    setShowForm(true)
    setFormError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_amount: Number(form.targetAmount),
        target_date: `${form.targetMonth}-01`,
        category_id: form.categoryId ? Number(form.categoryId) : null,
      }
      if (editingGoal) {
        await savingsGoalsApi.update(editingGoal.id, payload, token)
      } else {
        await savingsGoalsApi.create(payload, token)
      }
      resetForm()
      await loadGoals()
    } catch (err) {
      setFormError(err.message || `Failed to save ${termGoalLower}`)
    } finally {
      setSaving(false)
    }
  }

  const openContributeModal = (goal) => {
    setContributeError('')
    setContributeGoal(goal)
    setContributeForm({ amount: '', notes: '' })
  }

  const handleContribute = async (e) => {
    e.preventDefault()
    if (!contributeGoal) return
    setContributeError('')
    setContributeSaving(true)
    try {
      await savingsGoalsApi.contribute(
        contributeGoal.id,
        { amount: Number(contributeForm.amount), notes: contributeForm.notes.trim() || null },
        token
      )
      setContributeGoal(null)
      await loadGoals()
    } catch (err) {
      setContributeError(err.message || 'Failed to add contribution')
    } finally {
      setContributeSaving(false)
    }
  }

  const handleMarkComplete = async (goal) => {
    setBusyId(goal.id)
    try {
      await savingsGoalsApi.update(goal.id, { status: 'completed' }, token)
      await loadGoals()
    } catch (err) {
      setError(err.message || `Failed to update ${termGoalLower}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleCancelGoal = async (goal) => {
    setBusyId(goal.id)
    try {
      await savingsGoalsApi.cancel(goal.id, token)
      setConfirmCancelId(null)
      await loadGoals()
    } catch (err) {
      setError(err.message || `Failed to cancel ${termGoalLower}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="kt-budget-toolbar">
        <p className="kt-panel-subtitle" style={{ margin: 0 }}>
          {activeGoals.length} active {termGoalLower}{activeGoals.length === 1 ? '' : 's'}
        </p>
        {canManage && (
          <button
            type="button"
            className="kt-auth-button kt-categories-add-button"
            onClick={() => (showForm ? resetForm() : openAddForm())}
          >
            {showForm ? 'Cancel' : `+ Add ${termGoalLower}`}
          </button>
        )}
      </div>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {canManage && showForm && (
        <form className="kt-project-form kt-debt-form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="kt-field">
            <label htmlFor="goal-name">Name</label>
            <input
              id="goal-name"
              type="text"
              maxLength={255}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field">
            <label htmlFor="goal-target-amount">Target amount</label>
            <div className="kt-amount-input">
              <span className="kt-amount-prefix">£</span>
              <input
                id="goal-target-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={form.targetAmount}
                onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="kt-field">
            <label htmlFor="goal-target-date">Target month</label>
            <input
              id="goal-target-date"
              type="month"
              value={form.targetMonth}
              onChange={(e) => setForm((f) => ({ ...f, targetMonth: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field">
            <label htmlFor="goal-category">Link to budget category (optional)</label>
            <select
              id="goal-category"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="kt-field kt-field-wide">
            <label htmlFor="goal-description">Description (optional)</label>
            <textarea
              id="goal-description"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {formError && <div className="kt-auth-error kt-field-wide">{formError}</div>}

          <button className="kt-auth-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingGoal ? 'Save changes' : `Add ${termGoalLower}`}
          </button>
        </form>
      )}

      {loading && goals.length === 0 ? (
        <p className="kt-page-subtitle">Loading {termGoalLower}s…</p>
      ) : activeGoals.length === 0 ? (
        <div className="kt-categories-empty">No active {termGoalLower}s yet. Add one to start saving toward it.</div>
      ) : (
        <ul className="kt-savings-goal-list">
          {activeGoals.map((goal) => (
            <SavingsGoalCard
              key={goal.id}
              goal={goal}
              canManage={canManage}
              isAdmin={isAdmin}
              busy={busyId === goal.id}
              confirmingCancel={confirmCancelId === goal.id}
              onContribute={() => openContributeModal(goal)}
              onEdit={() => openEditForm(goal)}
              onMarkComplete={() => handleMarkComplete(goal)}
              onCancelRequest={() => setConfirmCancelId(goal.id)}
              onCancelConfirm={() => handleCancelGoal(goal)}
              onCancelDismiss={() => setConfirmCancelId(null)}
            />
          ))}
        </ul>
      )}

      <details className="kt-savings-goal-completed-section">
        <summary>
          Completed {termGoalLower}s ({completedGoals.length})
        </summary>
        {completedGoals.length === 0 ? (
          <div className="kt-categories-empty">No completed {termGoalLower}s yet.</div>
        ) : (
          <ul className="kt-savings-goal-list">
            {completedGoals.map((goal) => (
              <li key={goal.id} className="kt-savings-goal-card kt-savings-goal-card-completed">
                <h3 className="kt-savings-goal-name">
                  <span className="kt-savings-goal-completed-tick" aria-hidden="true">✓</span> {goal.name}
                </h3>
                <p className="kt-savings-goal-amounts">
                  {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                </p>
                <p className="kt-panel-subtitle">Completed on {formatDate(goal.updated_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </details>

      {contributeGoal && (
        <Modal title={`Add contribution — ${contributeGoal.name}`} onClose={() => setContributeGoal(null)}>
          <form onSubmit={handleContribute}>
            <div className="kt-field">
              <label>{termGoal}</label>
              <input type="text" value={contributeGoal.name} disabled />
            </div>
            <div className="kt-field">
              <label>Current amount</label>
              <input type="text" value={formatCurrency(contributeGoal.current_amount)} disabled />
            </div>
            <div className="kt-field">
              <label htmlFor="contribute-amount">Amount</label>
              <div className="kt-amount-input">
                <span className="kt-amount-prefix">£</span>
                <input
                  id="contribute-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={contributeForm.amount}
                  onChange={(e) => setContributeForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="kt-field kt-field-wide">
              <label htmlFor="contribute-notes">Notes</label>
              <textarea
                id="contribute-notes"
                rows={2}
                value={contributeForm.notes}
                onChange={(e) => setContributeForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {contributeError && <div className="kt-auth-error">{contributeError}</div>}
            <div className="kt-modal-actions">
              <button type="button" className="kt-category-link-button" onClick={() => setContributeGoal(null)}>
                Cancel
              </button>
              <button className="kt-auth-button" type="submit" disabled={contributeSaving}>
                {contributeSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function SavingsGoalCard({
  goal,
  canManage,
  isAdmin,
  busy,
  confirmingCancel,
  onContribute,
  onEdit,
  onMarkComplete,
  onCancelRequest,
  onCancelConfirm,
  onCancelDismiss,
}) {
  const percent = Math.min(100, Math.max(0, Number(goal.percent_complete)))

  return (
    <li className="kt-savings-goal-card">
      <h3 className="kt-savings-goal-name">{goal.name}</h3>
      {goal.description && <p className="kt-savings-goal-description">{goal.description}</p>}

      <p className="kt-savings-goal-amounts">
        <strong>{formatCurrency(goal.current_amount)}</strong> of {formatCurrency(goal.target_amount)} (
        {percent.toFixed(0)}%)
      </p>
      <div className="kt-savings-goal-progress-track">
        <div className="kt-savings-goal-progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="kt-savings-goal-meta">
        <span>Target date: {formatDate(goal.target_date)}</span>
        <span>{monthsRemainingLabel(goal.months_remaining)}</span>
        <span>Monthly amount needed: {formatCurrency(goal.monthly_needed)}</span>
        <span className={`kt-savings-goal-track-indicator kt-savings-goal-track-${goal.on_track ? 'on' : 'off'}`}>
          {goal.on_track ? '✓ On track' : '⚠ Behind target'}
        </span>
      </div>

      <div className="kt-savings-goal-actions">
        {canManage && (
          <button type="button" className="kt-auth-button" onClick={onContribute}>
            Add contribution
          </button>
        )}
        {canManage && (
          <button type="button" className="kt-category-link-button" onClick={onEdit}>
            Edit
          </button>
        )}
        {canManage && (
          <button type="button" className="kt-category-link-button" onClick={onMarkComplete} disabled={busy}>
            Mark complete
          </button>
        )}
        {isAdmin &&
          (confirmingCancel ? (
            <>
              <span className="kt-category-confirm-text">Cancel this goal?</span>
              <button type="button" className="kt-category-link-button kt-category-danger" onClick={onCancelConfirm} disabled={busy}>
                {busy ? 'Cancelling…' : 'Yes, cancel'}
              </button>
              <button type="button" className="kt-category-link-button" onClick={onCancelDismiss}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="kt-category-link-button kt-category-danger" onClick={onCancelRequest}>
              Cancel goal
            </button>
          ))}
      </div>
    </li>
  )
}
