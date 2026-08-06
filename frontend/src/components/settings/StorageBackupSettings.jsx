import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/AuthContext.jsx'
import { storageApi, triggerBlobDownload } from '../../utils/api.js'

const SCHEDULE_OPTIONS = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function formatDateTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString()
}

export default function StorageBackupSettings({ token }) {
  const { user } = useAuth()
  const isSuperadmin = user?.role === 'superadmin'

  const [status, setStatus] = useState(null)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    return Promise.all([storageApi.status(token), storageApi.listBackups(token)])
      .then(([s, b]) => {
        setStatus(s)
        setBackups(b)
      })
      .catch((err) => setError(err.message || 'Failed to load storage status'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div>
      <h2 className="kt-panel-title">Storage & Backup</h2>
      <p className="kt-panel-subtitle">Manage where invoice files and backups are kept.</p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="kt-settings-row-status">Loading…</p>
      ) : (
        <>
          <StorageStatusCard token={token} status={status} onChanged={load} />
          <BackupSection token={token} status={status} onChanged={load} />
          <RestoreSection token={token} isSuperadmin={isSuperadmin} onRestored={load} />
          <BackupHistory token={token} backups={backups} backupPath={status?.backup_path} onChanged={load} />

          <div className="kt-logs-info-box">
            Scheduled backups are retained based on your configured count. Manual backups are
            never automatically deleted. Store backups in a secure location — they contain all
            your data, including user accounts.
          </div>
        </>
      )}
    </div>
  )
}

function StorageStatusCard({ token, status, onChanged }) {
  const [showModal, setShowModal] = useState(false)
  if (!status) return null

  const maxSize = status.breakdown.reduce((m, b) => Math.max(m, b.size_bytes), 0) || 1

  return (
    <div className="kt-settings-list" style={{ marginBottom: 28 }}>
      <div className="kt-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="kt-settings-row-text" style={{ marginBottom: 12 }}>
          <span className="kt-settings-row-title">Storage location</span>
          <p className="kt-settings-row-description">{status.storage_path}</p>
        </div>

        <div className="kt-storage-usage-summary">
          <strong>{status.total_size_human}</strong> across {status.total_files} file
          {status.total_files === 1 ? '' : 's'}
        </div>

        <div className="kt-storage-breakdown">
          {status.breakdown.map((b) => (
            <div key={b.label} className="kt-storage-breakdown-row">
              <div className="kt-storage-breakdown-label">
                <span>{b.label}</span>
                <span>
                  {b.size_human} · {b.file_count} file{b.file_count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="kt-storage-bar-track">
                <div
                  className="kt-storage-bar-fill"
                  style={{ width: `${Math.max(b.size_bytes > 0 ? 2 : 0, (b.size_bytes / maxSize) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="kt-auth-button kt-settings-link-button"
            onClick={() => setShowModal(true)}
          >
            Change storage path
          </button>
        </div>
      </div>

      {showModal && (
        <ChangePathModal
          token={token}
          currentPath={status.storage_path}
          onClose={() => setShowModal(false)}
          onChanged={() => {
            setShowModal(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function ChangePathModal({ token, currentPath, onClose, onChanged }) {
  const [newPath, setNewPath] = useState(currentPath)
  const [moveFiles, setMoveFiles] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  const handleConfirm = async () => {
    if (!newPath.trim()) return
    setError('')
    setSaving(true)
    try {
      const result = await storageApi.changePath({ new_path: newPath.trim(), move_files: moveFiles }, token)
      setResultMessage(result.message)
      setTimeout(onChanged, 1200)
    } catch (err) {
      setError(err.message || 'Failed to change storage path')
      setSaving(false)
    }
  }

  return (
    <div className="kt-modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="kt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kt-modal-header">
          <h3 className="kt-modal-title">Change storage path</h3>
          <button type="button" className="kt-modal-close" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>
        <div className="kt-modal-body">
          {error && (
            <div className="kt-auth-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {resultMessage ? (
            <p className="kt-profile-success">{resultMessage}</p>
          ) : (
            <>
              <div className="kt-field" style={{ marginBottom: 16 }}>
                <label htmlFor="new-storage-path">New path</label>
                <input
                  id="new-storage-path"
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  disabled={saving}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={moveFiles}
                  className={`kt-toggle${moveFiles ? ' on' : ''}`}
                  onClick={() => setMoveFiles((v) => !v)}
                  disabled={saving}
                >
                  <span className="kt-toggle-track">
                    <span className="kt-toggle-thumb" />
                  </span>
                </button>
                <span className="kt-settings-row-title" style={{ fontSize: 14 }}>
                  Move existing files to new location
                </span>
              </div>

              {!moveFiles && (
                <p className="kt-danger-file-warning" style={{ marginTop: 12 }}>
                  Existing file links will break — invoices and reports already uploaded will no
                  longer be reachable until the files are moved there by hand.
                </p>
              )}

              <div className="kt-modal-actions">
                <button
                  type="button"
                  className="kt-auth-button-secondary"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="kt-auth-button"
                  onClick={handleConfirm}
                  disabled={saving || !newPath.trim()}
                >
                  {saving ? (moveFiles ? 'Moving files…' : 'Saving…') : 'Confirm'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BackupSection({ token, status, onChanged }) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [scheduleInput, setScheduleInput] = useState('manual')
  const [pathInput, setPathInput] = useState('')
  const [retentionInput, setRetentionInput] = useState(5)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleSaved, setScheduleSaved] = useState(false)

  const [runningNow, setRunningNow] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [runError, setRunError] = useState('')

  useEffect(() => {
    if (status) {
      setScheduleInput(status.backup_schedule)
      setPathInput(status.backup_path || '')
      setRetentionInput(status.backup_retention_count)
    }
  }, [status])

  const handleManualBackup = async () => {
    setError('')
    setCreating(true)
    try {
      const { blob, filename } = await storageApi.createBackup(token)
      triggerBlobDownload(blob, filename)
      onChanged()
    } catch (err) {
      setError(err.message || 'Backup failed')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveSchedule = async () => {
    setScheduleError('')
    setScheduleSaved(false)
    if (scheduleInput !== 'manual' && !pathInput.trim()) {
      setScheduleError('A backup destination path is required for scheduled backups')
      return
    }
    setSavingSchedule(true)
    try {
      await storageApi.setSchedule(
        {
          backup_schedule: scheduleInput,
          backup_path: pathInput.trim() || null,
          backup_retention_count: Number(retentionInput) || 5,
        },
        token
      )
      setScheduleSaved(true)
      onChanged()
    } catch (err) {
      setScheduleError(err.message || 'Failed to save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  const handleRunNow = async () => {
    setRunError('')
    setRunResult(null)
    setRunningNow(true)
    try {
      const result = await storageApi.runScheduledBackup(token)
      setRunResult(result)
      onChanged()
    } catch (err) {
      setRunError(err.message || 'Scheduled backup failed')
    } finally {
      setRunningNow(false)
    }
  }

  return (
    <div className="kt-settings-list" style={{ marginBottom: 28 }}>
      <div className="kt-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="kt-settings-row-text" style={{ marginBottom: 12 }}>
          <span className="kt-settings-row-title">Backups</span>
          <p className="kt-settings-row-description">
            {status?.last_backup_date
              ? `Last backup: ${formatDateTime(status.last_backup_date)} (${status.last_backup_size_human})`
              : 'Last backup: Never'}
          </p>
        </div>

        {error && (
          <div className="kt-auth-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div>
          <button type="button" className="kt-auth-button" onClick={handleManualBackup} disabled={creating}>
            {creating ? 'Creating backup — this may take a while…' : 'Create backup'}
          </button>
        </div>
      </div>

      <div className="kt-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="kt-settings-row-text" style={{ marginBottom: 12 }}>
          <span className="kt-settings-row-title">Scheduled backups</span>
          <p className="kt-settings-row-description">
            Automatically back up on a schedule to a destination path — e.g. a NAS share mounted
            into the backend container.
          </p>
        </div>

        {scheduleError && (
          <div className="kt-auth-error" style={{ marginBottom: 12 }}>
            {scheduleError}
          </div>
        )}
        {scheduleSaved && (
          <p className="kt-profile-success" style={{ marginBottom: 12 }}>
            Schedule saved.
          </p>
        )}
        {runError && (
          <div className="kt-auth-error" style={{ marginBottom: 12 }}>
            {runError}
          </div>
        )}
        {runResult && (
          <p className="kt-profile-success" style={{ marginBottom: 12 }}>
            Scheduled backup saved to {runResult.file_path} ({runResult.file_size_human}, took{' '}
            {runResult.duration_seconds}s).
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div className="kt-field" style={{ maxWidth: 200 }}>
            <label htmlFor="backup-schedule">Schedule</label>
            <select
              id="backup-schedule"
              value={scheduleInput}
              onChange={(e) => setScheduleInput(e.target.value)}
            >
              {SCHEDULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="kt-field" style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="backup-path">Backup destination path</label>
            <input
              id="backup-path"
              type="text"
              placeholder="/data/backups"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
            />
          </div>

          <div className="kt-field" style={{ maxWidth: 140 }}>
            <label htmlFor="backup-retention">Keep last</label>
            <input
              id="backup-retention"
              type="number"
              min={1}
              max={100}
              value={retentionInput}
              onChange={(e) => setRetentionInput(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="kt-auth-button" onClick={handleSaveSchedule} disabled={savingSchedule}>
            {savingSchedule ? 'Saving…' : 'Save schedule'}
          </button>
          <button
            type="button"
            className="kt-auth-button-secondary"
            onClick={handleRunNow}
            disabled={!status?.backup_path || runningNow}
            title={!status?.backup_path ? 'Configure a backup destination path first' : undefined}
          >
            {runningNow ? 'Running scheduled backup…' : 'Run scheduled backup now'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RestoreSection({ token, isSuperadmin, onRestored }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState(null)

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0]
    setFile(f || null)
    setPreview(null)
    setResult(null)
    setError('')
    if (!f) return
    setPreviewing(true)
    try {
      const manifest = await storageApi.previewRestore(f, token)
      setPreview(manifest)
    } catch (err) {
      setError(err.message || 'Could not read this backup file')
    } finally {
      setPreviewing(false)
    }
  }

  const handleRestore = async () => {
    if (!file || !password) return
    setError('')
    setRestoring(true)
    try {
      const res = await storageApi.restore(file, password, token)
      setResult(res)
      onRestored()
    } catch (err) {
      setError(err.message || 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  if (!isSuperadmin) {
    return (
      <div style={{ marginBottom: 28 }}>
        <h2 className="kt-panel-title kt-danger-title">Restore from backup</h2>
        <div className="kt-settings-coming-soon kt-danger-box">
          Restoring from a backup is only available to the Superadmin account.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 className="kt-panel-title kt-danger-title">Restore from backup</h2>
      <div className="kt-danger-warning" style={{ marginBottom: 16 }}>
        <strong>Restoring will replace all current data. This cannot be undone.</strong>
        <p>Make sure you have a current backup before restoring.</p>
      </div>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {result ? (
        <p className="kt-profile-success">{result.message}</p>
      ) : (
        <>
          <div className="kt-field" style={{ maxWidth: 420, marginBottom: 16 }}>
            <label htmlFor="restore-file">Keep Track backup file (.zip)</label>
            <input id="restore-file" type="file" accept=".zip" onChange={handleFileChange} disabled={restoring} />
          </div>

          {previewing && <p className="kt-settings-row-status">Reading backup…</p>}

          {preview && (
            <div className="kt-settings-list" style={{ marginBottom: 16, maxWidth: 520 }}>
              <div className="kt-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <span className="kt-settings-row-title">Backup preview</span>
                <p className="kt-settings-row-description">
                  Created {formatDateTime(preview.created_at)} ({preview.backup_type}) · Keep Track
                  v{preview.keep_track_version}
                </p>
                <p className="kt-settings-row-description">
                  Contains {preview.files_included_count} file(s) and:
                </p>
                <ul className="kt-storage-preview-list">
                  {Object.entries(preview.record_counts).map(([key, count]) => (
                    <li key={key}>
                      {count} {key.replace(/_/g, ' ')}
                    </li>
                  ))}
                </ul>
                {preview.superadmin_warning && (
                  <p className="kt-danger-file-warning" style={{ marginTop: 10 }}>
                    {preview.superadmin_warning}
                  </p>
                )}
              </div>
            </div>
          )}

          {preview && (
            <div className="kt-field" style={{ maxWidth: 320, marginBottom: 16 }}>
              <label htmlFor="restore-password">Superadmin password</label>
              <input
                id="restore-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={restoring}
                autoComplete="current-password"
              />
            </div>
          )}

          <button
            type="button"
            className="kt-auth-button kt-danger-reset-button"
            onClick={handleRestore}
            disabled={!preview || !password || restoring}
          >
            {restoring ? 'Restoring…' : 'Confirm restore'}
          </button>
        </>
      )}
    </div>
  )
}

function BackupHistory({ token, backups, backupPath, onChanged }) {
  const [busyFile, setBusyFile] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')

  const handleDownload = async (filename) => {
    setBusyFile(filename)
    setError('')
    try {
      const blob = await storageApi.downloadBackup(filename, token)
      triggerBlobDownload(blob, filename)
    } catch (err) {
      setError(err.message || 'Download failed')
    } finally {
      setBusyFile(null)
    }
  }

  const handleDelete = async (filename) => {
    setBusyFile(filename)
    setError('')
    try {
      await storageApi.deleteBackup(filename, token)
      setConfirmDelete(null)
      onChanged()
    } catch (err) {
      setError(err.message || 'Delete failed')
    } finally {
      setBusyFile(null)
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 className="kt-panel-title">Backup history</h2>
      {!backupPath ? (
        <div className="kt-settings-coming-soon">
          No backup destination configured yet — set one above to keep a browsable history here.
        </div>
      ) : backups.length === 0 ? (
        <div className="kt-settings-coming-soon">No backups yet.</div>
      ) : (
        <>
          {error && (
            <div className="kt-auth-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="kt-users-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename}>
                    <td>{b.filename}</td>
                    <td>{formatDateTime(b.created_at)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{b.backup_type}</td>
                    <td>{b.size_human}</td>
                    <td>
                      <div className="kt-users-actions">
                        <button
                          type="button"
                          className="kt-category-link-button"
                          onClick={() => handleDownload(b.filename)}
                          disabled={busyFile === b.filename}
                        >
                          Download
                        </button>
                        {confirmDelete === b.filename ? (
                          <>
                            <button
                              type="button"
                              className="kt-category-link-button kt-category-danger"
                              onClick={() => handleDelete(b.filename)}
                              disabled={busyFile === b.filename}
                            >
                              Confirm delete
                            </button>
                            <button
                              type="button"
                              className="kt-category-link-button"
                              onClick={() => setConfirmDelete(null)}
                              disabled={busyFile === b.filename}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="kt-category-link-button kt-category-danger"
                            onClick={() => setConfirmDelete(b.filename)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
