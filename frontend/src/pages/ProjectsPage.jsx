import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { projectsApi } from '../utils/api.js'
import { MONTH_NAMES, formatCurrency, formatMonthYear, projectUrgency, singularize } from '../utils/format.js'

const DESCRIPTION_TRUNCATE_LENGTH = 140

const YEAR_OPTIONS_AHEAD = 5

const emptyForm = { name: '', description: '', estimatedCost: '', expectedMonth: '', expectedYear: '', financialYearId: '' }

function currentMonthYear() {
  const now = new Date()
  return { expectedMonth: String(now.getMonth() + 1), expectedYear: String(now.getFullYear()) }
}

function yearOptions() {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: YEAR_OPTIONS_AHEAD + 1 }, (_, i) => currentYear + i)
}

const FY_OPTION_LABELS = ['Current', 'Next', 'Year after next']

// Green under budget, amber within 10% of the estimate, red over budget —
// per the task brief's colour coding, driven off the same variance/
// variance_percent the backend already computes (services/project_service.py).
function varianceLevel(project) {
  if (project.variance < 0) return 'over'
  if (project.variance_percent <= 10) return 'amber'
  return 'under'
}

function progressPercent(project) {
  if (!project.estimated_cost || Number(project.estimated_cost) <= 0) return 0
  return Math.min(100, (Number(project.actual_cost) / Number(project.estimated_cost)) * 100)
}

function fyLabelFor(financialYears, financialYearId) {
  if (financialYearId == null) return null
  const match = financialYears.find((y) => y.id === financialYearId)
  return match ? match.label : `FY #${financialYearId}`
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const token = user?.token
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canManage = user?.role !== 'readonly'
  const { term_projects: termProjects } = useTerminology()
  const projectsLower = termProjects.toLowerCase()
  const projectSingularLower = singularize(projectsLower)

  const [financialYears, setFinancialYears] = useState([])
  const [projects, setProjects] = useState([])
  const [completedProjects, setCompletedProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState(() => new Set())
  const [confirmAction, setConfirmAction] = useState(null) // { id, type: 'complete' | 'deactivate' }
  const [busyId, setBusyId] = useState(null)

  const [completedEditId, setCompletedEditId] = useState(null)
  const [completedEditForm, setCompletedEditForm] = useState({ name: '', description: '', estimatedCost: '', reason: '' })
  const [completedEditStep, setCompletedEditStep] = useState('form') // 'form' | 'confirm'
  const [completedEditSaving, setCompletedEditSaving] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [projectFinancialYears, activeProjects] = await Promise.all([
        projectsApi.financialYears(token),
        projectsApi.list(token),
      ])
      setFinancialYears(projectFinancialYears)
      setProjects(activeProjects)

      if (isAdmin) {
        const all = await projectsApi.listAll(token)
        setCompletedProjects(all.filter((p) => p.completed))
      } else {
        setCompletedProjects([])
      }
    } catch (err) {
      setError(err.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin])

  const totalUpcoming = useMemo(
    () => projects.reduce((sum, p) => sum + Number(p.estimated_cost), 0),
    [projects]
  )

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
  }

  const openAddForm = () => {
    setForm({ ...emptyForm, ...currentMonthYear() })
    setEditingId(null)
    setShowForm(true)
  }

  const openEditForm = (project) => {
    const [year, month] = project.expected_month.slice(0, 7).split('-')
    setForm({
      name: project.name,
      description: project.description || '',
      estimatedCost: String(project.estimated_cost),
      expectedMonth: String(Number(month)),
      expectedYear: year,
      financialYearId: project.financial_year_id != null ? String(project.financial_year_id) : '',
    })
    setEditingId(project.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        estimated_cost: Number(form.estimatedCost),
        expected_month: `${form.expectedYear}-${String(form.expectedMonth).padStart(2, '0')}-01`,
        financial_year_id: form.financialYearId ? Number(form.financialYearId) : null,
      }
      if (editingId) {
        await projectsApi.update(editingId, payload, token)
      } else {
        await projectsApi.create(payload, token)
      }
      resetForm()
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  const toggleExpanded = (id) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleInvoicesExpanded = (id) =>
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleComplete = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await projectsApi.complete(id, token)
      setConfirmAction(null)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to mark project as complete')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeactivate = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await projectsApi.deactivate(id, token)
      setConfirmAction(null)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to deactivate project')
    } finally {
      setBusyId(null)
    }
  }

  const openCompletedEdit = (project) => {
    setCompletedEditId(project.id)
    setCompletedEditForm({
      name: project.name,
      description: project.description || '',
      estimatedCost: String(project.estimated_cost),
      reason: '',
    })
    setCompletedEditStep('form')
  }

  const cancelCompletedEdit = () => {
    setCompletedEditId(null)
    setCompletedEditForm({ name: '', description: '', estimatedCost: '', reason: '' })
    setCompletedEditStep('form')
  }

  const handleCompletedEditSubmit = async (e) => {
    e.preventDefault()
    if (completedEditStep !== 'confirm') {
      setCompletedEditStep('confirm')
      return
    }
    setError('')
    setCompletedEditSaving(true)
    try {
      await projectsApi.update(
        completedEditId,
        {
          name: completedEditForm.name.trim(),
          description: completedEditForm.description.trim() || null,
          estimated_cost: Number(completedEditForm.estimatedCost),
          admin_override: true,
          edit_reason: completedEditForm.reason,
        },
        token
      )
      cancelCompletedEdit()
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setCompletedEditSaving(false)
    }
  }

  if (loading) {
    return <p className="kt-page-subtitle">Loading {projectsLower}…</p>
  }

  return (
    <div>
      <h1 className="kt-page-title">{termProjects}</h1>
      <p className="kt-page-subtitle">
        Log planned expenditure — a project, a purchase, a repair — so it's factored into the forecast.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="kt-metric-row" style={{ gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: 20 }}>
        <div className="kt-metric-card">
          <span className="kt-metric-label">Total estimated upcoming spend</span>
          <span className="kt-metric-value">{formatCurrency(totalUpcoming)}</span>
        </div>
      </div>

      {canManage && (
        <div className="kt-categories-toolbar">
          <button
            type="button"
            className="kt-auth-button kt-categories-add-button"
            onClick={() => (showForm ? resetForm() : openAddForm())}
          >
            {showForm ? 'Cancel' : `+ Add ${projectSingularLower}`}
          </button>
        </div>
      )}

      {showForm && (
        <form className="kt-project-form" onSubmit={handleSubmit}>
          <div className="kt-field">
            <label htmlFor="project-name">Name</label>
            <input
              id="project-name"
              type="text"
              value={form.name}
              maxLength={255}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field kt-field-wide">
            <label htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="kt-field">
            <label htmlFor="project-cost">Estimated cost</label>
            <div className="kt-amount-input">
              <span className="kt-amount-prefix">£</span>
              <input
                id="project-cost"
                type="number"
                step="0.01"
                min="0.01"
                value={form.estimatedCost}
                onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="kt-field">
            <label htmlFor="project-month">Expected month</label>
            <div className="kt-month-year-picker">
              <select
                id="project-month"
                value={form.expectedMonth}
                onChange={(e) => setForm((f) => ({ ...f, expectedMonth: e.target.value }))}
                required
              >
                <option value="" disabled>
                  Month
                </option>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                id="project-year"
                aria-label="Expected year"
                value={form.expectedYear}
                onChange={(e) => setForm((f) => ({ ...f, expectedYear: e.target.value }))}
                required
              >
                <option value="" disabled>
                  Year
                </option>
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            {form.expectedMonth && form.expectedYear && (
              <span className="kt-month-year-preview">
                {MONTH_NAMES[Number(form.expectedMonth) - 1]} {form.expectedYear}
              </span>
            )}
          </div>
          <div className="kt-field">
            <label htmlFor="project-fy">Financial year</label>
            <select
              id="project-fy"
              value={form.financialYearId}
              onChange={(e) => setForm((f) => ({ ...f, financialYearId: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {financialYears.map((y, idx) => (
                <option key={y.id} value={y.id}>
                  {FY_OPTION_LABELS[idx] || y.label} — {y.label}
                </option>
              ))}
              {editingId &&
                form.financialYearId &&
                !financialYears.some((y) => String(y.id) === form.financialYearId) && (
                  <option value={form.financialYearId}>{fyLabelFor(financialYears, Number(form.financialYearId))}</option>
                )}
            </select>
          </div>
          <button className="kt-auth-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add project'}
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="kt-categories-empty">
          No planned {projectsLower} yet. Log one to see it factored into the dashboard forecast.
        </div>
      ) : (
        <ul className="kt-project-list">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              financialYears={financialYears}
              expanded={expandedIds.has(project.id)}
              onToggleExpanded={() => toggleExpanded(project.id)}
              invoicesExpanded={expandedInvoiceIds.has(project.id)}
              onToggleInvoices={() => toggleInvoicesExpanded(project.id)}
              canManage={canManage}
              isAdmin={isAdmin}
              confirmAction={confirmAction}
              setConfirmAction={setConfirmAction}
              busy={busyId === project.id}
              onEdit={() => openEditForm(project)}
              onComplete={() => handleComplete(project.id)}
              onDeactivate={() => handleDeactivate(project.id)}
            />
          ))}
        </ul>
      )}

      {isAdmin && (
        <details className="kt-project-completed-section">
          <summary>Completed {projectsLower} ({completedProjects.length})</summary>
          {completedProjects.length === 0 ? (
            <div className="kt-categories-empty">No completed {projectsLower} yet.</div>
          ) : (
            <ul className="kt-project-list">
              {completedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  financialYears={financialYears}
                  expanded={expandedIds.has(project.id)}
                  onToggleExpanded={() => toggleExpanded(project.id)}
                  invoicesExpanded={expandedInvoiceIds.has(project.id)}
                  onToggleInvoices={() => toggleInvoicesExpanded(project.id)}
                  canManage={false}
                  isAdmin={isAdmin}
                  confirmAction={confirmAction}
                  setConfirmAction={setConfirmAction}
                  busy={false}
                  readOnly
                  onAdminEdit={() => openCompletedEdit(project)}
                />
              ))}
            </ul>
          )}

          {completedEditId != null && (
            <form className="kt-project-form kt-project-admin-edit-form" onSubmit={handleCompletedEditSubmit}>
              <p className="kt-admin-edit-warning kt-field-wide">
                You are editing a completed project. Status and completion date cannot be changed.
              </p>
              <div className="kt-field">
                <label htmlFor="completed-edit-name">Name</label>
                <input
                  id="completed-edit-name"
                  type="text"
                  value={completedEditForm.name}
                  maxLength={255}
                  onChange={(e) => setCompletedEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="kt-field kt-field-wide">
                <label htmlFor="completed-edit-description">Description</label>
                <textarea
                  id="completed-edit-description"
                  rows={3}
                  value={completedEditForm.description}
                  onChange={(e) => setCompletedEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="kt-field">
                <label htmlFor="completed-edit-cost">Estimated cost</label>
                <div className="kt-amount-input">
                  <span className="kt-amount-prefix">£</span>
                  <input
                    id="completed-edit-cost"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={completedEditForm.estimatedCost}
                    onChange={(e) => setCompletedEditForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="kt-field kt-field-wide">
                <label htmlFor="completed-edit-reason">Reason for edit</label>
                <textarea
                  id="completed-edit-reason"
                  rows={2}
                  value={completedEditForm.reason}
                  onChange={(e) => setCompletedEditForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Why is this completed project being corrected?"
                  required
                />
              </div>

              {completedEditStep === 'confirm' ? (
                <div className="kt-admin-edit-confirm kt-field-wide">
                  <span className="kt-category-confirm-text">
                    Are you sure you want to edit this completed project? This action will be logged.
                  </span>
                  <button className="kt-auth-button" type="submit" disabled={completedEditSaving}>
                    {completedEditSaving ? 'Saving…' : 'Yes, save changes'}
                  </button>
                  <button type="button" className="kt-category-link-button" onClick={cancelCompletedEdit}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="kt-admin-edit-actions kt-field-wide">
                  <button className="kt-auth-button" type="submit">
                    Save changes
                  </button>
                  <button type="button" className="kt-category-link-button" onClick={cancelCompletedEdit}>
                    Cancel
                  </button>
                </div>
              )}
            </form>
          )}
        </details>
      )}
    </div>
  )
}

const STATUS_LABELS = {
  planning: 'Planning',
  in_progress: 'In progress',
  completed: 'Complete',
  over_budget: 'Over budget',
}

function ProjectCard({
  project,
  financialYears,
  expanded,
  onToggleExpanded,
  invoicesExpanded,
  onToggleInvoices,
  canManage,
  isAdmin,
  confirmAction,
  setConfirmAction,
  busy,
  onEdit,
  onComplete,
  onDeactivate,
  onAdminEdit,
  readOnly = false,
}) {
  const description = project.description || ''
  const isLong = description.length > DESCRIPTION_TRUNCATE_LENGTH
  const shownDescription = expanded || !isLong ? description : `${description.slice(0, DESCRIPTION_TRUNCATE_LENGTH)}…`

  const urgency = !project.completed ? projectUrgency(project.expected_month) : null
  const confirmingComplete = confirmAction?.id === project.id && confirmAction.type === 'complete'
  const confirmingDeactivate = confirmAction?.id === project.id && confirmAction.type === 'deactivate'
  const level = varianceLevel(project)
  const progressPct = progressPercent(project)

  return (
    <li className={`kt-project-card${urgency ? ` kt-project-urgency-${urgency.status}` : ''}`}>
      <div className="kt-project-card-main">
        <div className="kt-project-card-header">
          <h3 className="kt-project-name">
            <Link to={`/projects/${project.id}`}>{project.name}</Link>
          </h3>
          <span className={`kt-category-status${project.completed ? '' : ' inactive'}`}>
            {project.completed ? 'Complete' : 'Active'}
          </span>
          <span className={`kt-project-status-badge kt-project-status-${project.project_status}`}>
            {STATUS_LABELS[project.project_status] || project.project_status}
          </span>
          {urgency && urgency.status !== 'normal' && (
            <span className={`kt-project-urgency-badge kt-project-urgency-badge-${urgency.status}`}>
              {urgency.label}
            </span>
          )}
        </div>

        {description && (
          <p className="kt-project-description">
            {shownDescription}{' '}
            {isLong && (
              <button type="button" className="kt-category-link-button" onClick={onToggleExpanded}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </p>
        )}

        <div className="kt-project-meta">
          <span>
            <strong>{formatCurrency(project.estimated_cost)}</strong> estimated
          </span>
          <span>Expected {formatMonthYear(project.expected_month)}</span>
          {project.financial_year_id != null && (
            <span>{fyLabelFor(financialYears, project.financial_year_id)}</span>
          )}
        </div>

        <div className="kt-project-financials">
          <div className="kt-project-financial-row">
            <span>Actual spend to date: <strong>{formatCurrency(project.actual_cost)}</strong></span>
            <span className={`kt-project-variance kt-project-variance-${level}`}>
              {project.variance >= 0 ? 'Under' : 'Over'} budget by{' '}
              {formatCurrency(Math.abs(project.variance))} ({Math.abs(Number(project.variance_percent)).toFixed(1)}%)
            </span>
          </div>
          <div className="kt-project-progress-track">
            <div
              className={`kt-project-progress-fill kt-project-variance-${level}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="kt-project-invoice-count-row">
            <span className="kt-project-invoice-count">
              {project.invoice_count} invoice{project.invoice_count === 1 ? '' : 's'} linked
            </span>
            {project.invoice_count > 0 && (
              <button type="button" className="kt-category-link-button" onClick={onToggleInvoices}>
                {invoicesExpanded ? 'Hide linked invoices' : 'View linked invoices'}
              </button>
            )}
          </div>
          {invoicesExpanded && project.invoice_count > 0 && (
            <ul className="kt-project-linked-invoices">
              {project.linked_invoices.map((inv) => (
                <li key={inv.id}>
                  <Link to={`/invoices/${inv.id}`} className="kt-project-linked-invoice-row">
                    <span>{inv.invoice_date}</span>
                    <span>{inv.supplier}</span>
                    <span>{formatCurrency(inv.amount)}</span>
                    <span>{inv.category_name || 'Uncategorised'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!readOnly && canManage && (
        <div className="kt-category-actions kt-project-actions">
          <button type="button" className="kt-category-link-button" onClick={onEdit}>
            Edit
          </button>

          {confirmingComplete ? (
            <>
              <span className="kt-category-confirm-text">Mark complete?</span>
              <button
                type="button"
                className="kt-category-link-button"
                onClick={onComplete}
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Yes, complete'}
              </button>
              <button type="button" className="kt-category-link-button" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="kt-category-link-button"
              onClick={() => setConfirmAction({ id: project.id, type: 'complete' })}
            >
              Mark complete
            </button>
          )}

          {isAdmin &&
            (confirmingDeactivate ? (
              <>
                <span className="kt-category-confirm-text">Deactivate?</span>
                <button
                  type="button"
                  className="kt-category-link-button kt-category-danger"
                  onClick={onDeactivate}
                  disabled={busy}
                >
                  {busy ? 'Deactivating…' : 'Yes, deactivate'}
                </button>
                <button type="button" className="kt-category-link-button" onClick={() => setConfirmAction(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="kt-category-link-button kt-category-danger"
                onClick={() => setConfirmAction({ id: project.id, type: 'deactivate' })}
              >
                Deactivate
              </button>
            ))}
        </div>
      )}

      {readOnly && isAdmin && onAdminEdit && (
        <div className="kt-category-actions kt-project-actions">
          <button type="button" className="kt-category-link-button" onClick={onAdminEdit}>
            Edit
          </button>
        </div>
      )}
    </li>
  )
}
