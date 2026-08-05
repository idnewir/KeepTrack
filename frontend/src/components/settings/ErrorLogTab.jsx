import { Fragment, useEffect, useRef, useState } from 'react'
import { usePaginationState, perPageParam } from '../../hooks/usePaginationState.js'
import { logsApi, triggerBlobDownload } from '../../utils/api.js'
import { formatDateTime } from '../../utils/format.js'
import PaginationBar from '../PaginationBar.jsx'

const SEVERITIES = ['info', 'warning', 'error', 'critical']

const SOURCES = [
  'ai_extraction', 'ai_report_summary', 'pdf_signing', 'pdf_processing',
  'auth', 'background_task', 'unhandled',
]

function SeverityBadge({ severity }) {
  return <span className={`kt-severity-badge kt-severity-${severity}`}>{severity}</span>
}

export default function ErrorLogTab({ token }) {
  const [status, setStatus] = useState(null)
  const [breakdown, setBreakdown] = useState(null)

  const [severity, setSeverity] = useState('')
  const [source, setSource] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const { page, perPage, setPage, setPerPage } = usePaginationState('error-log')

  const filters = { severity, source, dateFrom, dateTo }

  useEffect(() => {
    logsApi.status(token).then(setStatus).catch(() => {})

    Promise.all(
      SEVERITIES.map((s) => logsApi.errorsList({ severity: s, page: 1, perPage: 1 }, token))
    )
      .then((results) => {
        const counts = {}
        SEVERITIES.forEach((s, i) => {
          counts[s] = results[i].pagination.total_records
        })
        setBreakdown(counts)
      })
      .catch(() => setBreakdown(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setExpandedId(null)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, source, dateFrom, dateTo])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    logsApi
      .errorsList({ ...filters, page, perPage: perPageParam(perPage) }, token)
      .then((res) => {
        if (cancelled) return
        setRows(res.data)
        setPagination(res.pagination)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load the error log')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, source, dateFrom, dateTo, page, perPage, token])

  const handleExportCsv = async () => {
    const blob = await logsApi.errorsExportCsv(filters, token)
    triggerBlobDownload(blob, 'error_log_export.csv')
  }

  return (
    <div>
      {status && (
        <div className="kt-logs-status-bar">
          <div className="kt-logs-status-item">
            <span className="kt-logs-status-label">Total errors</span>
            <span className="kt-logs-status-value">{status.error_log_count.toLocaleString()}</span>
            <span className="kt-logs-status-sub">last 90 days</span>
          </div>
          {breakdown && (
            <div className="kt-logs-status-item kt-logs-severity-breakdown">
              {SEVERITIES.map((s) => (
                <span key={s} className={`kt-severity-badge kt-severity-${s}`}>
                  {breakdown[s]} {s}
                </span>
              ))}
            </div>
          )}
          <div className="kt-logs-status-item">
            <span className="kt-logs-status-label">Last cleanup</span>
            <span className="kt-logs-status-value kt-logs-status-value-small">
              {status.last_error_cleanup_run ? formatDateTime(status.last_error_cleanup_run) : 'Never'}
            </span>
            <span className="kt-logs-status-sub">
              Next cleanup:{' '}
              {status.next_error_cleanup_run ? formatDateTime(status.next_error_cleanup_run) : 'On next run'}
            </span>
          </div>
        </div>
      )}

      <div className="kt-invoices-filters kt-logs-filters">
        <div className="kt-field">
          <label htmlFor="err-filter-severity">Severity</label>
          <select id="err-filter-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="err-filter-source">Source</label>
          <select id="err-filter-source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="err-filter-from">From</label>
          <input id="err-filter-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="kt-field">
          <label htmlFor="err-filter-to">To</label>
          <input id="err-filter-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {error && <div className="kt-auth-error">{error}</div>}

      {loading ? (
        <p className="kt-page-subtitle">Loading error log…</p>
      ) : rows.length === 0 ? (
        <div className="kt-categories-empty">No error log entries match these filters.</div>
      ) : (
        <div className="kt-table-scroll">
          <table className="kt-logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedId === row.id
                const hasDetail = row.stack_trace || row.request_path
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`kt-logs-row${hasDetail ? ' kt-logs-row-clickable' : ''}${row.severity === 'critical' ? ' kt-logs-row-critical' : ''}`}
                      onClick={hasDetail ? () => setExpandedId(isExpanded ? null : row.id) : undefined}
                    >
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>
                        <SeverityBadge severity={row.severity} />
                      </td>
                      <td>{row.source}</td>
                      <td>{row.message}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="kt-logs-detail-row">
                        <td colSpan={4}>
                          <div className="kt-logs-detail">
                            {row.request_path && (
                              <div>
                                <strong>Request path:</strong> {row.request_path}
                              </div>
                            )}
                            {row.user_display_name && (
                              <div>
                                <strong>User:</strong> {row.user_display_name}
                              </div>
                            )}
                            {row.stack_trace && (
                              <div>
                                <strong>Stack trace:</strong>
                                <pre className="kt-logs-metadata">{row.stack_trace}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PaginationBar
        pagination={pagination}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        onExportCsv={handleExportCsv}
        disabled={loading}
      />
    </div>
  )
}
