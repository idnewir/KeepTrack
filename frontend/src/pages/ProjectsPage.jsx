import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { financialYearsApi, projectsApi } from '../utils/api.js'
import { formatCurrency, formatMonthYear, projectUrgency } from '../utils/format.js'

const DESCRIPTION_TRUNCATE_LENGTH = 140

const emptyForm = { name: '', description: '', estimatedCost: '', expectedMonth: '', financialYearId: '' }

export default function ProjectsPage() {
  const { user } = useAuth()
  const token = user?.token
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canManage = user?.role !== 'readonly'

  const [fy, setFy] = useState(null)
  const [projects, setProjects] = useState([])
  const [completedProjects, setCompletedProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [expandedIds, setExpandedIds] = useState(() => new Set())
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
      const [currentFy, activeProjects] = await Promise.all([
        financialYearsApi.current(token),
        projectsApi.list(token),
      ])
      setFy(currentFy)
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
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  const openEditForm = (project) => {
    setForm({
      name: project.name,
      description: project.description || '',
      estimatedCost: String(project.estimated_cost),
      expectedMonth: project.expected_month.slice(0, 7),
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
        expected_month: `${form.expectedMonth}-01`,
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
    return <p className="kt-page-subtitle">Loading projects…</p>
  }

  return (
    <div>
      <h1 className="kt-page-title">Projects</h1>
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
            {showForm ? 'Cancel' : '+ Add project'}
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
            <input
              id="project-month"
              type="month"
              value={form.expectedMonth}
              onChange={(e) => setForm((f) => ({ ...f, expectedMonth: e.target.value }))}
              required
            />
          </div>
          <div className="kt-field">
            <label htmlFor="project-fy">Financial year</label>
            <select
              id="project-fy"
              value={form.financialYearId}
              onChange={(e) => setForm((f) => ({ ...f, financialYearId: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {fy && <option value={fy.id}>{fy.label}</option>}
            </select>
          </div>
          <button className="kt-auth-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add project'}
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="kt-categories-empty">
          No planned projects yet. Log one to see it factored into the dashboard forecast.
        </div>
      ) : (
        <ul className="kt-project-list">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              fy={fy}
              expanded={expandedIds.has(project.id)}
              onToggleExpanded={() => toggleExpanded(project.id)}
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
          <summary>Completed projects ({completedProjects.length})</summary>
          {completedProjects.length === 0 ? (
            <div className="kt-categories-empty">No completed projects yet.</div>
          ) : (
            <ul className="kt-project-list">
              {completedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  fy={fy}
                  expanded={expandedIds.has(project.id)}
                  onToggleExpanded={() => toggleExpanded(project.id)}
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

function ProjectCard({
  project,
  fy,
  expanded,
  onToggleExpanded,
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

  return (
    <li className={`kt-project-card${urgency ? ` kt-project-urgency-${urgency.status}` : ''}`}>
      <div className="kt-project-card-main">
        <div className="kt-project-card-header">
          <h3 className="kt-project-name">{project.name}</h3>
          <span className={`kt-category-status${project.completed ? '' : ' inactive'}`}>
            {project.completed ? 'Complete' : 'Active'}
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
            <strong>{formatCurrency(project.estimated_cost)}</strong>
          </span>
          <span>Expected {formatMonthYear(project.expected_month)}</span>
          {project.financial_year_id != null && (
            <span>{fy && fy.id === project.financial_year_id ? fy.label : `FY #${project.financial_year_id}`}</span>
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
