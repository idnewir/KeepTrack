import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { usePaginationState, perPageParam } from '../hooks/usePaginationState.js'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { categoriesApi, invoicesApi, projectsApi, triggerBlobDownload } from '../utils/api.js'
import { singularize } from '../utils/format.js'
import PaginationBar from '../components/PaginationBar.jsx'

const REVIEWED_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'false', label: 'Unreviewed' },
  { value: 'true', label: 'Reviewed' },
]

const SIGNED_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'unsigned', label: 'Unsigned only' },
  { value: 'signed', label: 'Signed only' },
]

function formatAmount(amount) {
  return `£${Number(amount).toFixed(2)}`
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const canUpload = user?.role !== 'readonly'
  const { term_expenses: termExpenses } = useTerminology()
  const expensesLower = termExpenses.toLowerCase()
  const expenseSingularLower = singularize(expensesLower)

  // Initial filter values can arrive via the URL (e.g. a dashboard chart or
  // notification linking here already filtered) — read once on mount, same
  // as arriving with no filters at all.
  const [searchParams] = useSearchParams()

  const [categories, setCategories] = useState([])
  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { page, perPage, setPage, setPerPage } = usePaginationState('invoices')

  // A dashboard notification can also arrive with a shorthand `filter`
  // param (unreviewed/unsigned) instead of spelling out `reviewed`/`signed`
  // directly, so a click lands pre-filtered without the caller needing to
  // know the underlying field names.
  const quickFilter = searchParams.get('filter')

  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') || '')
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '')
  const [reviewed, setReviewed] = useState(
    quickFilter === 'unreviewed' ? 'false' : searchParams.get('reviewed') || ''
  )
  const [signedFilter, setSignedFilter] = useState(
    quickFilter === 'unsigned' ? 'unsigned' : searchParams.get('signed') || ''
  )
  const [projectFilter, setProjectFilter] = useState(searchParams.get('project') || '')

  const filters = { categoryId, dateFrom, dateTo, reviewed, signed: signedFilter, project: projectFilter }

  useEffect(() => {
    categoriesApi.list(token).then(setCategories).catch(() => setCategories([]))
    projectsApi.list(token).then(setProjects).catch(() => setProjects([]))
  }, [token])

  // Filters (not page/per-page) changing resets back to page 1, per the
  // "changing filters resets to page 1" requirement — skipped on the very
  // first render so the URL's own initial ?page=N isn't clobbered.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, dateFrom, dateTo, reviewed, signedFilter, projectFilter])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    invoicesApi
      .list({ ...filters, page, perPage: perPageParam(perPage) }, token)
      .then((res) => {
        if (cancelled) return
        setInvoices(res.data)
        setPagination(res.pagination)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load invoices')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, dateFrom, dateTo, reviewed, signedFilter, projectFilter, page, perPage, token])

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const handleExportCsv = async () => {
    const blob = await invoicesApi.exportCsv(filters, token)
    triggerBlobDownload(blob, 'invoices_export.csv')
  }

  const handleExportPdf = async () => {
    const blob = await invoicesApi.exportPdf(filters, token)
    triggerBlobDownload(blob, 'invoices_export.pdf')
  }

  return (
    <div>
      <div className="kt-invoices-header">
        <div>
          <h1 className="kt-page-title">{termExpenses}</h1>
          <p className="kt-page-subtitle">Every {expenseSingularLower} on file, with its review status.</p>
        </div>
        {canUpload && (
          <Link to="/upload" className="kt-auth-button kt-invoices-upload-button">
            + Upload {expenseSingularLower}
          </Link>
        )}
      </div>

      <div className="kt-invoices-filters">
        <div className="kt-field">
          <label htmlFor="filter-category">Category</label>
          <select id="filter-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="filter-from">From</label>
          <input id="filter-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="kt-field">
          <label htmlFor="filter-to">To</label>
          <input id="filter-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="kt-field">
          <label htmlFor="filter-reviewed">Status</label>
          <select id="filter-reviewed" value={reviewed} onChange={(e) => setReviewed(e.target.value)}>
            {REVIEWED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="filter-signed">Signed</label>
          <select id="filter-signed" value={signedFilter} onChange={(e) => setSignedFilter(e.target.value)}>
            {SIGNED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="filter-project">Project</label>
          <select id="filter-project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">All invoices</option>
            <option value="unlinked">Unlinked only</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="kt-auth-error">{error}</div>}

      {loading ? (
        <p className="kt-page-subtitle">Loading {expensesLower}…</p>
      ) : invoices.length === 0 ? (
        <div className="kt-categories-empty">No {expensesLower} match these filters.</div>
      ) : (
        <table className="kt-invoices-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Status</th>
              <th>Signed</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const category = invoice.category_id != null ? categoryById.get(invoice.category_id) : null
              return (
                <tr
                  key={invoice.id}
                  className="kt-invoice-row"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <td>{invoice.invoice_date}</td>
                  <td>{invoice.supplier || <em>Unknown supplier</em>}</td>
                  <td>{formatAmount(invoice.amount)}</td>
                  <td>
                    {category ? (
                      <span className="kt-invoice-category">
                        <span
                          className="kt-category-swatch"
                          style={{ background: category.colour }}
                          aria-hidden="true"
                        />
                        {category.name}
                      </span>
                    ) : (
                      <em>Uncategorised</em>
                    )}
                  </td>
                  <td>
                    {invoice.reviewed ? (
                      <span className="kt-status-badge kt-status-reviewed">Reviewed</span>
                    ) : (
                      <span className="kt-status-badge kt-status-unreviewed">Unreviewed</span>
                    )}
                    {invoice.duplicate_flag && (
                      <span className="kt-status-badge kt-status-duplicate">Possible duplicate</span>
                    )}
                  </td>
                  <td>
                    {invoice.signed ? (
                      <span className="kt-status-badge kt-status-signed">Signed</span>
                    ) : (
                      invoice.reviewed && (
                        <span className="kt-status-badge kt-status-unsigned">Unsigned</span>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <PaginationBar
        pagination={pagination}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        disabled={loading}
      />
    </div>
  )
}
