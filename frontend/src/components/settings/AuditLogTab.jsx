import { Fragment, useEffect, useRef, useState } from 'react'
import { usePaginationState, perPageParam } from '../../hooks/usePaginationState.js'
import { authApi, logsApi, triggerBlobDownload } from '../../utils/api.js'
import { auditActionColor, formatDateTime } from '../../utils/format.js'
import PaginationBar from '../PaginationBar.jsx'

const ACTION_TYPES = [
  'user.login', 'user.login_failed', 'user.logout', 'user.mfa_failed',
  'user.created', 'user.approved', 'user.rejected', 'user.role_changed',
  'user.deactivated', 'user.reactivated', 'user.password_reset', 'user.password_changed',
  'invoice.uploaded', 'invoice.reviewed', 'invoice.signed', 'invoice.resigned',
  'invoice.edited', 'invoice.deleted',
  'contribution.created', 'contribution.edited', 'contribution.deleted',
  'reconciliation.submitted', 'reconciliation.edited',
  'project.created', 'project.edited', 'project.completed', 'project.deactivated',
  'settings.changed',
  'report.generated', 'report.deleted',
  'system.reset', 'audit_log.archived', 'error_log.cleaned',
]

function StatusBar({ status, includeArchive, onArchiveNow, archiving, archiveMessage }) {
  if (!status) return null
  return (
    <div className="kt-logs-status-bar">
      <div className="kt-logs-status-item">
        <span className="kt-logs-status-label">Active entries</span>
        <span className="kt-logs-status-value">{status.audit_log_count.toLocaleString()}</span>
        <span className="kt-logs-status-sub">covers last 90 days</span>
      </div>
      <div className="kt-logs-status-item">
        <span className="kt-logs-status-label">Archive entries</span>
        <span className="kt-logs-status-value">{status.audit_log_archive_count.toLocaleString()}</span>
        <span className="kt-logs-status-sub">permanent record</span>
      </div>
      <div className="kt-logs-status-item">
        <span className="kt-logs-status-label">Last archived</span>
        <span className="kt-logs-status-value kt-logs-status-value-small">
          {status.last_archive_run ? formatDateTime(status.last_archive_run) : 'Never'}
        </span>
        <span className="kt-logs-status-sub">
          Next archive:{' '}
          {status.next_archive_run ? formatDateTime(status.next_archive_run) : 'On next run'}
        </span>
      </div>
      <div className="kt-logs-status-actions">
        <button
          type="button"
          className="kt-category-link-button"
          onClick={onArchiveNow}
          disabled={archiving || includeArchive}
          title={includeArchive ? 'Switch back to the active log to archive' : undefined}
        >
          {archiving ? 'Archiving…' : 'Archive now'}
        </button>
        {archiveMessage && <span className="kt-logs-archive-message">{archiveMessage}</span>}
      </div>
    </div>
  )
}

export default function AuditLogTab({ token }) {
  const [status, setStatus] = useState(null)
  const [includeArchive, setIncludeArchive] = useState(false)

  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState('')
  const [actionType, setActionType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [archiving, setArchiving] = useState(false)
  const [archiveMessage, setArchiveMessage] = useState('')

  const { page, perPage, setPage, setPerPage } = usePaginationState('audit-log')

  const filters = { userId, actionType, dateFrom, dateTo, archive: includeArchive }

  const loadStatus = () => {
    logsApi.status(token).then(setStatus).catch(() => {})
  }

  useEffect(() => {
    loadStatus()
    authApi
      .listUsers({ approved: true, perPage: 0 }, token)
      .then((res) => setUsers(res.data))
      .catch(() => setUsers([]))
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
  }, [userId, actionType, dateFrom, dateTo, includeArchive])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    logsApi
      .auditList({ ...filters, page, perPage: perPageParam(perPage) }, token)
      .then((res) => {
        if (cancelled) return
        setRows(res.data)
        setPagination(res.pagination)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load the audit log')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, actionType, dateFrom, dateTo, includeArchive, page, perPage, token])

  const handleExportCsv = async () => {
    const blob = await logsApi.auditExportCsv(filters, token)
    triggerBlobDownload(blob, includeArchive ? 'audit_log_archive_export.csv' : 'audit_log_export.csv')
  }

  const handleArchiveNow = async () => {
    setArchiving(true)
    setArchiveMessage('')
    try {
      const result = await logsApi.archiveNow(token)
      setArchiveMessage(`Archived ${result.archived_count} ${result.archived_count === 1 ? 'entry' : 'entries'}.`)
      setStatus(result)
      // The just-archived entries have left the active table — reload
      // whichever view is currently showing so counts stay honest.
      const res = await logsApi.auditList({ ...filters, page: 1, perPage: perPageParam(perPage) }, token)
      setRows(res.data)
      setPagination(res.pagination)
      setPage(1)
    } catch (err) {
      setArchiveMessage(err.message || 'Failed to archive')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div>
      <StatusBar
        status={status}
        includeArchive={includeArchive}
        onArchiveNow={handleArchiveNow}
        archiving={archiving}
        archiveMessage={archiveMessage}
      />

      <div className="kt-invoices-filters kt-logs-filters">
        <div className="kt-field">
          <label htmlFor="logs-filter-user">User</label>
          <select id="logs-filter-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.username}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="logs-filter-action">Action type</label>
          <select id="logs-filter-action" value={actionType} onChange={(e) => setActionType(e.target.value)}>
            <option value="">All actions</option>
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="logs-filter-from">From</label>
          <input id="logs-filter-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="kt-field">
          <label htmlFor="logs-filter-to">To</label>
          <input id="logs-filter-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <label className="kt-logs-archive-toggle">
          <input
            type="checkbox"
            checked={includeArchive}
            onChange={(e) => setIncludeArchive(e.target.checked)}
          />
          Include archive
        </label>
      </div>

      {includeArchive && (
        <div className="kt-logs-archive-banner">Showing archived records — a permanent, read-only history.</div>
      )}

      {error && <div className="kt-auth-error">{error}</div>}

      {loading ? (
        <p className="kt-page-subtitle">Loading audit log…</p>
      ) : rows.length === 0 ? (
        <div className="kt-categories-empty">No audit log entries match these filters.</div>
      ) : (
        <div className="kt-table-scroll">
          <table className="kt-logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedId === row.id
                const hasDetail = row.metadata || row.affected_table || row.ip_address
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`kt-logs-row kt-logs-row-${auditActionColor(row.action_type)}${hasDetail ? ' kt-logs-row-clickable' : ''}`}
                      onClick={hasDetail ? () => setExpandedId(isExpanded ? null : row.id) : undefined}
                    >
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>{row.user_display_name || (row.user_id ? `User #${row.user_id}` : 'System')}</td>
                      <td>
                        <code className="kt-logs-action-code">{row.action_type}</code>
                      </td>
                      <td>{row.description}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="kt-logs-detail-row">
                        <td colSpan={4}>
                          <div className="kt-logs-detail">
                            {row.affected_table && (
                              <div>
                                <strong>Affected:</strong> {row.affected_table}
                                {row.affected_record_id != null ? ` #${row.affected_record_id}` : ''}
                              </div>
                            )}
                            {row.ip_address && (
                              <div>
                                <strong>IP address:</strong> {row.ip_address}
                              </div>
                            )}
                            {row.metadata && (
                              <div>
                                <strong>Details:</strong>
                                <pre className="kt-logs-metadata">{JSON.stringify(row.metadata, null, 2)}</pre>
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
