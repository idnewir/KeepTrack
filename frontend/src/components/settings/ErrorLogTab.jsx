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

const RESOLVED_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unresolved', label: 'Unresolved' },
  { value: 'resolved', label: 'Resolved' },
]

const CLEAR_ALL_PHRASE = 'CLEAR ERROR LOG'

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
  const [resolvedFilter, setResolvedFilter] = useState('all')

  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [resolvingId, setResolvingId] = useState(null)
  const [resolveNoteDraft, setResolveNoteDraft] = useState('')
  const [rowBusyId, setRowBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const [showClearAllModal, setShowClearAllModal] = useState(false)

  const { page, perPage, setPage, setPerPage } = usePaginationState('error-log')

  const filters = { severity, source, dateFrom, dateTo, resolved: resolvedFilter }

  const loadStatusAndBreakdown = () => {
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
  }

  useEffect(() => {
    loadStatusAndBreakdown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setExpandedId(null)
    setResolvingId(null)
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, source, dateFrom, dateTo, resolvedFilter])

  const loadErrors = () => {
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
  }

  useEffect(
    loadErrors,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [severity, source, dateFrom, dateTo, resolvedFilter, page, perPage, token]
  )

  const refreshAll = () => {
    loadErrors()
    loadStatusAndBreakdown()
  }

  const handleExportCsv = async () => {
    const blob = await logsApi.errorsExportCsv(filters, token)
    triggerBlobDownload(blob, 'error_log_export.csv')
  }

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openResolveForm = (id) => {
    setResolvingId(id)
    setResolveNoteDraft('')
  }

  const handleConfirmResolve = async (id) => {
    setRowBusyId(id)
    try {
      await logsApi.resolveError(id, resolveNoteDraft.trim(), token)
      setResolvingId(null)
      refreshAll()
    } catch (err) {
      setError(err.message || 'Failed to resolve error log entry')
    } finally {
      setRowBusyId(null)
    }
  }

  const handleUnresolve = async (id) => {
    setRowBusyId(id)
    try {
      await logsApi.unresolveError(id, token)
      refreshAll()
    } catch (err) {
      setError(err.message || 'Failed to unresolve error log entry')
    } finally {
      setRowBusyId(null)
    }
  }

  const handleResolveSelected = async () => {
    setBulkBusy(true)
    setBulkError('')
    try {
      await Promise.all([...selectedIds].map((id) => logsApi.resolveError(id, null, token)))
      setSelectedIds(new Set())
      refreshAll()
    } catch (err) {
      setBulkError(err.message || 'Failed to resolve selected entries')
    } finally {
      setBulkBusy(false)
    }
  }

  const handleDeleteSelected = async () => {
    setBulkBusy(true)
    setBulkError('')
    try {
      await logsApi.clearSelectedErrors([...selectedIds], token)
      setSelectedIds(new Set())
      setConfirmBulkDelete(false)
      refreshAll()
    } catch (err) {
      setBulkError(err.message || 'Failed to delete selected entries')
    } finally {
      setBulkBusy(false)
    }
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
          <div className="kt-logs-status-actions">
            <button
              type="button"
              className="kt-category-link-button kt-category-danger"
              onClick={() => setShowClearAllModal(true)}
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      <div className="kt-users-tabs" role="tablist" aria-label="Filter by resolved status">
        {RESOLVED_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={resolvedFilter === f.value}
            className={`kt-users-tab${resolvedFilter === f.value ? ' active' : ''}`}
            onClick={() => setResolvedFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

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

      {selectedIds.size > 0 && (
        <div className="kt-bulk-action-bar">
          <span className="kt-bulk-action-count">{selectedIds.size} selected</span>
          {bulkError && <span className="kt-auth-error kt-bulk-action-error">{bulkError}</span>}
          <div className="kt-bulk-action-buttons">
            <button
              type="button"
              className="kt-category-link-button"
              onClick={handleResolveSelected}
              disabled={bulkBusy}
            >
              {bulkBusy ? 'Working…' : 'Resolve selected'}
            </button>
            {confirmBulkDelete ? (
              <>
                <button
                  type="button"
                  className="kt-category-link-button kt-category-danger"
                  onClick={handleDeleteSelected}
                  disabled={bulkBusy}
                >
                  {bulkBusy ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => setConfirmBulkDelete(false)}
                  disabled={bulkBusy}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="kt-category-link-button kt-category-danger"
                onClick={() => setConfirmBulkDelete(true)}
                disabled={bulkBusy}
              >
                Delete selected
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="kt-page-subtitle">Loading error log…</p>
      ) : rows.length === 0 ? (
        <div className="kt-categories-empty">No error log entries match these filters.</div>
      ) : (
        <div className="kt-table-scroll">
          <table className="kt-logs-table">
            <thead>
              <tr>
                <th />
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedId === row.id
                const hasDetail = row.stack_trace || row.request_path
                const isResolving = resolvingId === row.id
                const isRowBusy = rowBusyId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`kt-logs-row${hasDetail ? ' kt-logs-row-clickable' : ''}${row.severity === 'critical' ? ' kt-logs-row-critical' : ''}`}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={`Select error log entry ${row.id}`}
                        />
                      </td>
                      <td onClick={hasDetail ? () => setExpandedId(isExpanded ? null : row.id) : undefined}>
                        {formatDateTime(row.created_at)}
                      </td>
                      <td onClick={hasDetail ? () => setExpandedId(isExpanded ? null : row.id) : undefined}>
                        <SeverityBadge severity={row.severity} />
                      </td>
                      <td onClick={hasDetail ? () => setExpandedId(isExpanded ? null : row.id) : undefined}>
                        {row.source}
                      </td>
                      <td onClick={hasDetail ? () => setExpandedId(isExpanded ? null : row.id) : undefined}>
                        {row.message}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {row.resolved ? (
                          <div className="kt-error-resolved-info">
                            <span className="kt-severity-badge kt-resolved-badge">Resolved</span>
                            <span className="kt-logs-status-sub">
                              {row.resolved_by_display_name || 'Unknown'} ·{' '}
                              {row.resolved_at ? formatDateTime(row.resolved_at) : ''}
                            </span>
                            {row.resolved_note && (
                              <div className="kt-error-resolved-note">{row.resolved_note}</div>
                            )}
                            <button
                              type="button"
                              className="kt-category-link-button"
                              onClick={() => handleUnresolve(row.id)}
                              disabled={isRowBusy}
                            >
                              {isRowBusy ? 'Working…' : 'Unresolve'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="kt-category-link-button"
                            onClick={() => (isResolving ? setResolvingId(null) : openResolveForm(row.id))}
                          >
                            {isResolving ? 'Cancel' : 'Resolve'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isResolving && (
                      <tr className="kt-logs-detail-row">
                        <td colSpan={6}>
                          <div className="kt-error-resolve-form">
                            <label htmlFor={`resolve-note-${row.id}`}>Resolution note (optional)</label>
                            <input
                              id={`resolve-note-${row.id}`}
                              type="text"
                              value={resolveNoteDraft}
                              onChange={(e) => setResolveNoteDraft(e.target.value)}
                              disabled={isRowBusy}
                              maxLength={500}
                              autoFocus
                            />
                            <div className="kt-error-resolve-actions">
                              <button
                                type="button"
                                className="kt-auth-button-secondary"
                                onClick={() => setResolvingId(null)}
                                disabled={isRowBusy}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="kt-auth-button"
                                onClick={() => handleConfirmResolve(row.id)}
                                disabled={isRowBusy}
                              >
                                {isRowBusy ? 'Resolving…' : 'Confirm'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr className="kt-logs-detail-row">
                        <td colSpan={6}>
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

      {showClearAllModal && (
        <ClearAllModal
          token={token}
          totalCount={status?.error_log_count ?? 0}
          onClose={() => setShowClearAllModal(false)}
          onCleared={() => {
            setShowClearAllModal(false)
            setSelectedIds(new Set())
            refreshAll()
          }}
        />
      )}
    </div>
  )
}

function ClearAllModal({ token, totalCount, onClose, onCleared }) {
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = phrase === CLEAR_ALL_PHRASE

  const handleConfirm = async () => {
    if (!matches) return
    setBusy(true)
    setError('')
    try {
      await logsApi.clearAllErrors(phrase, token)
      onCleared()
    } catch (err) {
      setError(err.message || 'Failed to clear the error log')
      setBusy(false)
    }
  }

  return (
    <div className="kt-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="kt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kt-modal-header">
          <h3 className="kt-modal-title">Clear entire error log</h3>
          <button type="button" className="kt-modal-close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="kt-modal-body">
          <p className="kt-danger-file-warning">
            This will permanently delete all {totalCount} entries currently in the error log,
            regardless of any filters applied. This cannot be undone.
          </p>

          {error && (
            <div className="kt-auth-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div className="kt-field" style={{ marginBottom: 16 }}>
            <label htmlFor="clear-all-phrase">Type the phrase below to confirm</label>
            <div className="kt-confirm-phrase-box">{CLEAR_ALL_PHRASE}</div>
            <input
              id="clear-all-phrase"
              type="text"
              className="kt-confirm-phrase-input"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="kt-modal-actions">
            <button
              type="button"
              className="kt-auth-button kt-auth-button-secondary"
              style={{ marginTop: 0 }}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="kt-auth-button kt-danger-reset-button"
              style={{ marginTop: 0 }}
              onClick={handleConfirm}
              disabled={!matches || busy}
            >
              {busy ? 'Clearing…' : 'Clear error log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
