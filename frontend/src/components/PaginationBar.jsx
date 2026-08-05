import { useState } from 'react'

const PER_PAGE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: 'all', label: 'All' },
]

const ALL_WARNING_THRESHOLD = 500

function pageNumbers(current, total, maxVisible = 5) {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1)

  const half = Math.floor(maxVisible / 2)
  let start = Math.max(1, current - half)
  let end = start + maxVisible - 1
  if (end > total) {
    end = total
    start = end - maxVisible + 1
  }

  const pages = []
  if (start > 1) {
    pages.push(1)
    if (start > 2) pages.push('…')
  }
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < total) {
    if (end < total - 1) pages.push('…')
    pages.push(total)
  }
  return pages
}

/**
 * Reusable pagination + export bar for list views. `pagination` is the
 * `{ page, per_page, total_records, total_pages, has_next, has_previous }`
 * object every paginated list endpoint returns. `perPage` is the raw UI
 * value ('10' | '25' | '50' | '100' | 'all'), separate from
 * pagination.per_page (which is a resolved number, not the "all" sentinel).
 */
export default function PaginationBar({
  pagination,
  perPage,
  onPageChange,
  onPerPageChange,
  onExportCsv,
  onExportPdf,
  disabled = false,
}) {
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportError, setExportError] = useState('')

  if (!pagination) return null

  const { page, total_records: totalRecords, total_pages: totalPages, has_next: hasNext, has_previous: hasPrevious } = pagination

  const rangeStart = totalRecords === 0 ? 0 : (page - 1) * (pagination.per_page || totalRecords) + 1
  const rangeEnd = totalRecords === 0 ? 0 : Math.min(rangeStart + (pagination.per_page || totalRecords) - 1, totalRecords)

  const handlePerPageChange = (value) => {
    if (value === 'all' && totalRecords > ALL_WARNING_THRESHOLD) {
      const proceed = window.confirm(
        `Loading all ${totalRecords.toLocaleString()} records may be slow. Continue?`
      )
      if (!proceed) return
    }
    onPerPageChange(value)
  }

  const runExport = async (kind) => {
    const setBusy = kind === 'csv' ? setExportingCsv : setExportingPdf
    const handler = kind === 'csv' ? onExportCsv : onExportPdf
    if (!handler) return
    setExportError('')
    setBusy(true)
    try {
      await handler()
    } catch (err) {
      setExportError(err.message || `Failed to export ${kind.toUpperCase()}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kt-pagination-bar">
      {exportError && <div className="kt-pagination-error">{exportError}</div>}
      <div className="kt-pagination-row">
        <div className="kt-pagination-summary">
          {totalRecords === 0
            ? 'No records'
            : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${totalRecords.toLocaleString()} records`}
        </div>

        {totalPages > 1 && (
          <div className="kt-pagination-pages" role="navigation" aria-label="Pagination">
            <button
              type="button"
              className="kt-pagination-arrow"
              onClick={() => onPageChange(page - 1)}
              disabled={disabled || !hasPrevious}
              aria-label="Previous page"
            >
              ‹
            </button>
            {pageNumbers(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`ellipsis-${i}`} className="kt-pagination-ellipsis">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={p}
                  className={`kt-pagination-page${p === page ? ' active' : ''}`}
                  onClick={() => onPageChange(p)}
                  disabled={disabled}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="kt-pagination-arrow"
              onClick={() => onPageChange(page + 1)}
              disabled={disabled || !hasNext}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}

        <div className="kt-pagination-controls">
          <label className="kt-pagination-per-page">
            <span>Per page</span>
            <select value={perPage} onChange={(e) => handlePerPageChange(e.target.value)} disabled={disabled}>
              {PER_PAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {onExportCsv && (
            <button
              type="button"
              className="kt-pagination-export-button"
              onClick={() => runExport('csv')}
              disabled={disabled || exportingCsv}
            >
              {exportingCsv ? (
                <>
                  <span className="kt-pagination-spinner" aria-hidden="true" /> Exporting…
                </>
              ) : (
                'Export CSV'
              )}
            </button>
          )}

          {onExportPdf && (
            <button
              type="button"
              className="kt-pagination-export-button"
              onClick={() => runExport('pdf')}
              disabled={disabled || exportingPdf}
            >
              {exportingPdf ? (
                <>
                  <span className="kt-pagination-spinner" aria-hidden="true" /> Exporting…
                </>
              ) : (
                'Export PDF'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
