import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { usePaginationState, perPageParam } from '../hooks/usePaginationState.js'
import { categoriesApi, reportsApi, triggerBlobDownload } from '../utils/api.js'
import HelpIconLink from '../components/HelpIconLink.jsx'
import PaginationBar from '../components/PaginationBar.jsx'

const REPORT_TYPES = [
  { value: 'historical', label: 'Historical' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'combined', label: 'Combined' },
]

const YEARS_OPTIONS = [1, 2, 3, 4, 5]

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const emptyForm = {
  title: '',
  reportType: 'historical',
  dateFrom: '',
  dateTo: '',
  yearsIncluded: 3,
  includeAiSummary: true,
}

export default function ReportsPage() {
  const { user } = useAuth()
  const token = user?.token
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const [categories, setCategories] = useState([])
  const [reports, setReports] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { page, perPage, setPage, setPerPage } = usePaginationState('reports')

  const [form, setForm] = useState(emptyForm)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => new Set())
  const [generating, setGenerating] = useState(false)

  const [downloadingId, setDownloadingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [cats, reportList] = await Promise.all([
        categoriesApi.list(token),
        reportsApi.list({ page, perPage: perPageParam(perPage) }, token),
      ])
      setCategories(cats)
      setSelectedCategoryIds((prev) => (prev.size === 0 ? new Set(cats.map((c) => c.id)) : prev))
      setReports(reportList.data)
      setPagination(reportList.pagination)
    } catch (err) {
      setError(err.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, token])

  const handleExportCsv = async () => {
    const blob = await reportsApi.exportCsv(token)
    triggerBlobDownload(blob, 'reports_export.csv')
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const allSelected = categories.length > 0 && selectedCategoryIds.size === categories.length

  const toggleCategory = (id) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedCategoryIds(allSelected ? new Set() : new Set(categories.map((c) => c.id)))
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setGenerating(true)
    try {
      const payload = {
        title: form.title.trim() || null,
        date_from: form.dateFrom,
        date_to: form.dateTo,
        // Every active category checked means "no filter" to the backend —
        // an explicit subset is only sent once the user has narrowed it down.
        category_ids: allSelected ? [] : Array.from(selectedCategoryIds),
        years_included: Number(form.yearsIncluded),
        report_type: form.reportType,
        include_ai_summary: form.includeAiSummary,
      }
      const report = await reportsApi.generate(payload, token)
      const blob = await reportsApi.downloadPdf(report.id, token)
      triggerBlobDownload(blob, `${report.title}.pdf`)
      setSuccess(`"${report.title}" was generated and downloaded successfully.`)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (report) => {
    setError('')
    setDownloadingId(report.id)
    try {
      const blob = await reportsApi.downloadPdf(report.id, token)
      triggerBlobDownload(blob, `${report.title}.pdf`)
    } catch (err) {
      setError(err.message || 'Failed to download report')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (id) => {
    setError('')
    setDeletingId(id)
    try {
      await reportsApi.remove(id, token)
      setConfirmDeleteId(null)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete report')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="kt-page-header">
        <h1 className="kt-page-title">Reports</h1>
        <p className="kt-page-subtitle">
          Generate a professional, AI-summarised PDF report, and download anything you've generated before.
        </p>
        <HelpIconLink topic="reports-guide" />
      </div>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="kt-reports-success" style={{ marginBottom: 20 }}>
          {success}
        </div>
      )}

      <section className="kt-dashboard-panel">
        <h2 className="kt-panel-title">Generate new report</h2>
        <p className="kt-panel-subtitle">
          Choose a date range and scope, then generate — this can take 15-30 seconds while the AI writes the
          summary and the PDF is built.
        </p>

        <form className="kt-reports-form" onSubmit={handleGenerate}>
          <div className="kt-field">
            <label htmlFor="report-title">Title (optional)</label>
            <input
              id="report-title"
              type="text"
              maxLength={255}
              placeholder="Auto-generated if left blank"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="kt-field">
            <label htmlFor="report-type">Report type</label>
            <select
              id="report-type"
              value={form.reportType}
              onChange={(e) => setForm((f) => ({ ...f, reportType: e.target.value }))}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="kt-field">
            <label htmlFor="report-from">From</label>
            <input
              id="report-from"
              type="date"
              value={form.dateFrom}
              onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
              required
            />
          </div>

          <div className="kt-field">
            <label htmlFor="report-to">To</label>
            <input
              id="report-to"
              type="date"
              value={form.dateTo}
              onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
              required
            />
          </div>

          <div className="kt-field">
            <label htmlFor="report-years">Years to include</label>
            <select
              id="report-years"
              value={form.yearsIncluded}
              onChange={(e) => setForm((f) => ({ ...f, yearsIncluded: e.target.value }))}
            >
              {YEARS_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y} year{y === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>

          <div className="kt-field kt-field-wide">
            <div className="kt-reports-categories-header">
              <label>Categories</label>
              <button type="button" className="kt-category-link-button" onClick={toggleSelectAll}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="kt-reports-categories-grid">
              {categories.map((category) => (
                <label key={category.id} className="kt-reports-category-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.has(category.id)}
                    onChange={() => toggleCategory(category.id)}
                  />
                  <span className="kt-category-swatch" style={{ background: category.colour }} aria-hidden="true" />
                  {category.name}
                </label>
              ))}
            </div>
          </div>

          <div className="kt-field kt-field-wide">
            <label className="kt-reports-ai-toggle">
              <input
                type="checkbox"
                checked={form.includeAiSummary}
                onChange={(e) => setForm((f) => ({ ...f, includeAiSummary: e.target.checked }))}
              />
              Include AI-written summary and key insights
            </label>
          </div>

          <button className="kt-auth-button kt-reports-generate-button" type="submit" disabled={generating}>
            {generating ? 'Generating…' : 'Generate report'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="kt-panel-title" style={{ marginTop: 8 }}>
          Previous reports
        </h2>

        {loading ? (
          <p className="kt-page-subtitle">Loading reports…</p>
        ) : reports.length === 0 ? (
          <div className="kt-categories-empty">No reports have been generated yet.</div>
        ) : (
          <table className="kt-invoices-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Date range</th>
                <th>Categories</th>
                <th>Generated by</th>
                <th>Generated at</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const categoryNames = report.categories_included.length
                  ? report.categories_included
                      .map((id) => categoryById.get(id)?.name || `Category #${id}`)
                      .join(', ')
                  : 'All categories'
                const confirming = confirmDeleteId === report.id

                return (
                  <tr key={report.id}>
                    <td>{report.title}</td>
                    <td>{REPORT_TYPES.find((t) => t.value === report.report_type)?.label || report.report_type}</td>
                    <td>
                      {formatDate(report.date_from)} – {formatDate(report.date_to)}
                    </td>
                    <td>{categoryNames}</td>
                    <td>{report.generated_by_username || `User #${report.generated_by}`}</td>
                    <td>{formatDateTime(report.generated_at)}</td>
                    <td>
                      <div className="kt-category-actions">
                        <button
                          type="button"
                          className="kt-category-link-button"
                          onClick={() => handleDownload(report)}
                          disabled={downloadingId === report.id}
                        >
                          {downloadingId === report.id ? 'Downloading…' : 'Download'}
                        </button>

                        {isAdmin &&
                          (confirming ? (
                            <>
                              <span className="kt-category-confirm-text">Delete?</span>
                              <button
                                type="button"
                                className="kt-category-link-button kt-category-danger"
                                onClick={() => handleDelete(report.id)}
                                disabled={deletingId === report.id}
                              >
                                {deletingId === report.id ? 'Deleting…' : 'Yes, delete'}
                              </button>
                              <button
                                type="button"
                                className="kt-category-link-button"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="kt-category-link-button kt-category-danger"
                              onClick={() => setConfirmDeleteId(report.id)}
                            >
                              Delete
                            </button>
                          ))}
                      </div>
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
          disabled={loading}
        />
      </section>
    </div>
  )
}
