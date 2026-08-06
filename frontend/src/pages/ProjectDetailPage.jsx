import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { projectsApi } from '../utils/api.js'
import { formatCurrency, formatDateTime, singularize } from '../utils/format.js'

const STATUS_LABELS = {
  planning: 'Planning',
  in_progress: 'In progress',
  completed: 'Complete',
  over_budget: 'Over budget',
}

// Same colour-coding rule as the Projects page cards (services/project_service.py
// computes variance/variance_percent, this just maps them to a colour).
function varianceLevel(project) {
  if (project.variance < 0) return 'over'
  if (project.variance_percent <= 10) return 'amber'
  return 'under'
}

function progressPercent(project) {
  if (!project.estimated_cost || Number(project.estimated_cost) <= 0) return 0
  return Math.min(100, (Number(project.actual_cost) / Number(project.estimated_cost)) * 100)
}

export default function ProjectDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const { term_projects: termProjects } = useTerminology()
  const projectsLower = termProjects.toLowerCase()
  const projectSingular = singularize(termProjects)

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    projectsApi
      .get(id, token)
      .then(setProject)
      .catch((err) => setError(err.message || `Failed to load ${projectSingular.toLowerCase()}`))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token])

  if (loading) return <p className="kt-page-subtitle">Loading {projectSingular.toLowerCase()}…</p>
  if (!project) {
    return (
      <div>
        <div className="kt-auth-error">{error || `${projectSingular} not found`}</div>
        <Link to="/projects">Back to {projectsLower}</Link>
      </div>
    )
  }

  const level = varianceLevel(project)
  const progressPct = progressPercent(project)
  // The project<->invoice link has no timestamp of its own (see
  // docs/decisions-log.md) — "first invoice linked" is approximated as the
  // earliest invoice_date among currently linked invoices, not a literal
  // "linked at" event time.
  const earliestInvoiceDate = project.linked_invoices.length
    ? project.linked_invoices.reduce(
        (min, inv) => (inv.invoice_date < min ? inv.invoice_date : min),
        project.linked_invoices[0].invoice_date
      )
    : null

  return (
    <div>
      <p>
        <Link to="/projects">← Back to {projectsLower}</Link>
      </p>

      <div className="kt-project-detail-header">
        <h1 className="kt-page-title">{project.name}</h1>
        <span className={`kt-project-status-badge kt-project-status-${project.project_status}`}>
          {STATUS_LABELS[project.project_status] || project.project_status}
        </span>
      </div>
      {project.description && <p className="kt-page-subtitle">{project.description}</p>}

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="kt-metric-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="kt-metric-card">
          <span className="kt-metric-label">Estimated cost</span>
          <span className="kt-metric-value">{formatCurrency(project.estimated_cost)}</span>
        </div>
        <div className="kt-metric-card">
          <span className="kt-metric-label">Actual spend to date</span>
          <span className="kt-metric-value">{formatCurrency(project.actual_cost)}</span>
        </div>
        <div className={`kt-metric-card kt-project-variance-card kt-project-variance-${level}`}>
          <span className="kt-metric-label">{project.variance >= 0 ? 'Remaining budget' : 'Over budget by'}</span>
          <span className="kt-metric-value">{formatCurrency(Math.abs(project.variance))}</span>
          <span className="kt-metric-status">
            {Math.abs(Number(project.variance_percent)).toFixed(1)}% variance
          </span>
        </div>
      </div>

      <div className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Progress</h2>
        <div className="kt-project-progress-track kt-project-progress-track-large">
          <div
            className={`kt-project-progress-fill kt-project-variance-${level}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="kt-panel-subtitle" style={{ marginTop: 8 }}>
          {formatCurrency(project.actual_cost)} of {formatCurrency(project.estimated_cost)} spent (
          {progressPct.toFixed(0)}%)
        </p>
      </div>

      <div className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Timeline</h2>
        <ul className="kt-project-timeline">
          <li>
            <span>Created</span>
            <span>{formatDateTime(project.created_at)}</span>
          </li>
          {earliestInvoiceDate && (
            <li>
              <span>First invoice linked</span>
              <span>{earliestInvoiceDate}</span>
            </li>
          )}
          {project.completed && (
            <li>
              <span>Completed</span>
              <span>{project.completed_at ? formatDateTime(project.completed_at) : '—'}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Linked invoices</h2>
        <p className="kt-panel-subtitle">
          {project.invoice_count} invoice{project.invoice_count === 1 ? '' : 's'} confirmed against this project.
        </p>
        {project.linked_invoices.length === 0 ? (
          <div className="kt-categories-empty">No invoices linked to this project yet.</div>
        ) : (
          <table className="kt-invoices-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Amount</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {project.linked_invoices.map((inv) => (
                <tr key={inv.id} className="kt-invoice-row" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td>{inv.invoice_date}</td>
                  <td>{inv.supplier}</td>
                  <td>{formatCurrency(inv.amount)}</td>
                  <td>
                    {inv.category_name ? (
                      <span className="kt-invoice-category">
                        <span
                          className="kt-category-swatch"
                          style={{ background: inv.category_colour }}
                          aria-hidden="true"
                        />
                        {inv.category_name}
                      </span>
                    ) : (
                      <em>Uncategorised</em>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
