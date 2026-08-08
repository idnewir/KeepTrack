import { useEffect, useState } from 'react'
import { folderApi } from '../../utils/api.js'
import { formatDateTime } from '../../utils/format.js'

const POLL_INTERVAL_OPTIONS = [
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 1800, label: '30 minutes' },
]

const OUTPUT_BEHAVIOUR_OPTIONS = [
  { value: 'browser_only', label: 'Browser download only' },
  { value: 'folder_only', label: 'Save to folder only' },
  { value: 'both', label: 'Both — download and save to folder' },
]

const STATUS_LABELS = {
  detected: 'Detected',
  processing: 'Processing',
  completed: 'Completed',
  skipped: 'Skipped',
  failed: 'Failed',
  duplicate_flagged: 'Duplicate flagged',
  duplicate_overridden: 'Duplicate overridden',
}

// Reuses the existing info/warning/error severity badge styles (see
// ErrorLogTab.jsx) rather than introducing a fourth colour scheme just for
// this one status list.
const STATUS_SEVERITY = {
  detected: 'info',
  processing: 'info',
  completed: 'info',
  duplicate_overridden: 'info',
  skipped: 'warning',
  duplicate_flagged: 'warning',
  failed: 'error',
}

function StatusBadge({ status }) {
  return (
    <span className={`kt-severity-badge kt-severity-${STATUS_SEVERITY[status] || 'info'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

// Shared local-path / SMB fields used by both the input and output
// sections — identical shape, different key prefix and copy.
function ConnectionFields({
  type,
  onTypeChange,
  path,
  onPathChange,
  pathPlaceholder,
  pathLabel,
  pathNote,
  smbServer,
  onSmbServerChange,
  smbShare,
  onSmbShareChange,
  smbGuest,
  onSmbGuestChange,
  smbUsername,
  onSmbUsernameChange,
  smbPassword,
  onSmbPasswordChange,
  smbPasswordSet,
  idPrefix,
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            name={`${idPrefix}-type`}
            checked={type === 'local'}
            onChange={() => onTypeChange('local')}
          />
          Local path
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            name={`${idPrefix}-type`}
            checked={type === 'smb'}
            onChange={() => onTypeChange('smb')}
          />
          SMB network share
        </label>
      </div>

      {type === 'local' ? (
        <div className="kt-field" style={{ marginBottom: 12 }}>
          <label htmlFor={`${idPrefix}-path`}>{pathLabel}</label>
          <input
            id={`${idPrefix}-path`}
            type="text"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder={pathPlaceholder}
          />
          <p className="kt-field-note">{pathNote}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
            <div className="kt-field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor={`${idPrefix}-smb-server`}>Server</label>
              <input
                id={`${idPrefix}-smb-server`}
                type="text"
                value={smbServer}
                onChange={(e) => onSmbServerChange(e.target.value)}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="kt-field" style={{ flex: 1, minWidth: 180 }}>
              <label htmlFor={`${idPrefix}-smb-share`}>Share name</label>
              <input
                id={`${idPrefix}-smb-share`}
                type="text"
                value={smbShare}
                onChange={(e) => onSmbShareChange(e.target.value)}
                placeholder="invoices"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button
              type="button"
              role="switch"
              aria-checked={smbGuest}
              className={`kt-toggle${smbGuest ? ' on' : ''}`}
              onClick={() => onSmbGuestChange(!smbGuest)}
            >
              <span className="kt-toggle-track">
                <span className="kt-toggle-thumb" />
              </span>
            </button>
            <span className="kt-settings-row-title" style={{ fontSize: 14 }}>
              This share allows guest access
            </span>
          </div>

          {!smbGuest && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
              <div className="kt-field" style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor={`${idPrefix}-smb-username`}>Username</label>
                <input
                  id={`${idPrefix}-smb-username`}
                  type="text"
                  value={smbUsername}
                  onChange={(e) => onSmbUsernameChange(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="kt-field" style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor={`${idPrefix}-smb-password`}>
                  Password {smbPasswordSet && !smbPassword && <span className="kt-field-note">(set — leave blank to keep)</span>}
                </label>
                <input
                  id={`${idPrefix}-smb-password`}
                  type="password"
                  value={smbPassword}
                  onChange={(e) => onSmbPasswordChange(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          <div className="kt-field" style={{ marginBottom: 8 }}>
            <label htmlFor={`${idPrefix}-path`}>Full path within share</label>
            <input
              id={`${idPrefix}-path`}
              type="text"
              value={path}
              onChange={(e) => onPathChange(e.target.value)}
              placeholder="/incoming"
            />
          </div>
          <p className="kt-field-note" style={{ marginBottom: 12 }}>
            Preview: smb://{smbServer || '[server]'}/{smbShare || '[share]'}
            {path || ''}
          </p>
        </>
      )}
    </>
  )
}

// `fullWidth` renders the button spanning the card footer with the result
// message stacked below it, per both cards' consistent bottom-of-card
// placement — the inline variant (used nowhere currently, kept for any
// future non-card usage) stays a compact row.
function TestConnectionButton({ onTest, fullWidth }) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null)

  const handleTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      const res = await onTest()
      setResult(res)
    } catch (err) {
      setResult({ success: false, error: err.message || 'Connection test failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      style={
        fullWidth
          ? { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }
          : { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }
      }
    >
      <button
        type="button"
        className="kt-auth-button-secondary"
        style={fullWidth ? { width: '100%' } : undefined}
        onClick={handleTest}
        disabled={testing}
      >
        {testing ? 'Testing…' : 'Test connection'}
      </button>
      {result && result.success && (
        <span className="kt-profile-success" style={fullWidth ? { textAlign: 'center' } : undefined}>
          ✓ Connected{result.file_count !== null && result.file_count !== undefined ? ` — ${result.file_count} file(s) found` : ''}
        </span>
      )}
      {result && !result.success && (
        <span className="kt-auth-error" style={{ margin: 0, textAlign: fullWidth ? 'center' : undefined }}>
          {result.error}
        </span>
      )}
    </div>
  )
}

function InputFolderSection({ token, config, pollInterval, onSaved }) {
  const [enabled, setEnabled] = useState(config.enabled)
  const [type, setType] = useState(config.type)
  const [path, setPath] = useState(config.path || '')
  const [smbServer, setSmbServer] = useState(config.smb_server || '')
  const [smbShare, setSmbShare] = useState(config.smb_share || '')
  const [smbUsername, setSmbUsername] = useState(config.smb_username || '')
  const [smbPassword, setSmbPassword] = useState('')
  const [smbGuest, setSmbGuest] = useState(config.smb_guest)
  const [poll, setPoll] = useState(pollInterval)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await folderApi.updateInputConfig(
        {
          enabled,
          type,
          path: path.trim() || null,
          smb_server: smbServer.trim() || null,
          smb_share: smbShare.trim() || null,
          smb_username: smbUsername.trim() || null,
          smb_password: smbPassword ? smbPassword : null,
          smb_guest: smbGuest,
          poll_interval: Number(poll),
        },
        token
      )
      setSmbPassword('')
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save input folder settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kt-settings-list kt-folder-card">
      <div className="kt-settings-row kt-folder-card-header">
        <div className="kt-settings-row-text">
          <span className="kt-settings-row-title">Input folder</span>
          <p className="kt-settings-row-description">Watch for new invoices</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`kt-toggle${enabled ? ' on' : ''}`}
          onClick={() => setEnabled((v) => !v)}
        >
          <span className="kt-toggle-track">
            <span className="kt-toggle-thumb" />
          </span>
        </button>
      </div>

      <div className="kt-settings-row kt-folder-card-body">
        <ConnectionFields
          idPrefix="folder-input"
          type={type}
          onTypeChange={setType}
          path={path}
          onPathChange={setPath}
          pathPlaceholder="/mnt/input"
          pathLabel="Path"
          pathNote="Mount this path as a Docker volume. See the setup guide for NFS instructions."
          smbServer={smbServer}
          onSmbServerChange={setSmbServer}
          smbShare={smbShare}
          onSmbShareChange={setSmbShare}
          smbGuest={smbGuest}
          onSmbGuestChange={setSmbGuest}
          smbUsername={smbUsername}
          onSmbUsernameChange={setSmbUsername}
          smbPassword={smbPassword}
          onSmbPasswordChange={setSmbPassword}
          smbPasswordSet={config.smb_password_set}
        />

        <div className="kt-field" style={{ maxWidth: 220, marginBottom: 16 }}>
          <label htmlFor="folder-input-poll">Poll interval</label>
          <select id="folder-input-poll" value={poll} onChange={(e) => setPoll(Number(e.target.value))}>
            {POLL_INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="kt-auth-error" style={{ marginBottom: 12 }}>{error}</div>}
        {saved && <p className="kt-profile-success" style={{ marginBottom: 12 }}>Input folder settings saved.</p>}

        <button type="button" className="kt-auth-button" style={{ alignSelf: 'flex-start' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="kt-settings-row kt-folder-card-footer">
        <TestConnectionButton fullWidth onTest={() => folderApi.testInput(token)} />
      </div>
    </div>
  )
}

function OutputFolderSection({ token, config, behaviour: initialBehaviour, onSaved }) {
  const [enabled, setEnabled] = useState(config.enabled)
  const [type, setType] = useState(config.type)
  const [path, setPath] = useState(config.path || '')
  const [smbServer, setSmbServer] = useState(config.smb_server || '')
  const [smbShare, setSmbShare] = useState(config.smb_share || '')
  const [smbUsername, setSmbUsername] = useState(config.smb_username || '')
  const [smbPassword, setSmbPassword] = useState('')
  const [smbGuest, setSmbGuest] = useState(config.smb_guest)
  const [behaviour, setBehaviour] = useState(initialBehaviour)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await folderApi.updateOutputConfig(
        {
          enabled,
          type,
          path: path.trim() || null,
          smb_server: smbServer.trim() || null,
          smb_share: smbShare.trim() || null,
          smb_username: smbUsername.trim() || null,
          smb_password: smbPassword ? smbPassword : null,
          smb_guest: smbGuest,
          behaviour,
        },
        token
      )
      setSmbPassword('')
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save output folder settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kt-settings-list kt-folder-card">
      <div className="kt-settings-row kt-folder-card-header">
        <div className="kt-settings-row-text">
          <span className="kt-settings-row-title">Output folder</span>
          <p className="kt-settings-row-description">Save signed PDFs to folder</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`kt-toggle${enabled ? ' on' : ''}`}
          onClick={() => setEnabled((v) => !v)}
        >
          <span className="kt-toggle-track">
            <span className="kt-toggle-thumb" />
          </span>
        </button>
      </div>

      <div className="kt-settings-row kt-folder-card-body">
        <ConnectionFields
          idPrefix="folder-output"
          type={type}
          onTypeChange={setType}
          path={path}
          onPathChange={setPath}
          pathPlaceholder="/mnt/output"
          pathLabel="Path"
          pathNote="Mount this path as a Docker volume. See the setup guide for NFS instructions."
          smbServer={smbServer}
          onSmbServerChange={setSmbServer}
          smbShare={smbShare}
          onSmbShareChange={setSmbShare}
          smbGuest={smbGuest}
          onSmbGuestChange={setSmbGuest}
          smbUsername={smbUsername}
          onSmbUsernameChange={setSmbUsername}
          smbPassword={smbPassword}
          onSmbPasswordChange={setSmbPassword}
          smbPasswordSet={config.smb_password_set}
        />

        <div className="kt-field" style={{ maxWidth: 320, marginBottom: 16 }}>
          <label htmlFor="folder-output-behaviour">Output behaviour</label>
          <select id="folder-output-behaviour" value={behaviour} onChange={(e) => setBehaviour(e.target.value)}>
            {OUTPUT_BEHAVIOUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="kt-auth-error" style={{ marginBottom: 12 }}>{error}</div>}
        {saved && <p className="kt-profile-success" style={{ marginBottom: 12 }}>Output folder settings saved.</p>}

        <button type="button" className="kt-auth-button" style={{ alignSelf: 'flex-start' }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="kt-settings-row kt-folder-card-footer">
        <TestConnectionButton fullWidth onTest={() => folderApi.testOutput(token)} />
      </div>
    </div>
  )
}

function FullLogModal({ token, onClose }) {
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    folderApi
      .log({ page, perPage: 25 }, token)
      .then((data) => {
        setRows(data.data)
        setPagination(data.pagination)
      })
      .catch((err) => setError(err.message || 'Failed to load the folder watcher log'))
      .finally(() => setLoading(false))
  }, [page, token])

  return (
    <div className="kt-modal-overlay" onClick={onClose}>
      <div className="kt-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="kt-modal-header">
          <h3 className="kt-modal-title">Folder watcher log</h3>
          <button type="button" className="kt-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="kt-modal-body">
          {error && <div className="kt-auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          {loading ? (
            <p className="kt-settings-row-status">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="kt-settings-coming-soon">No activity yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="kt-users-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Status</th>
                    <th>Message</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.filename}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>{row.message || '—'}</td>
                      <td>{formatDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.total_pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                className="kt-category-link-button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.has_previous}
              >
                Previous
              </button>
              <span className="kt-settings-row-status">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <button
                type="button"
                className="kt-category-link-button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.has_next}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FolderStatusPanel({ status, onViewFullLog }) {
  if (!status) return null
  const { input, output, recent_log: recentLog } = status

  return (
    <div className="kt-folder-activity-card">
      <h2 className="kt-panel-title">Folder Activity</h2>
      <p className="kt-panel-subtitle">Live status of the input and output folder watchers.</p>

      <div className="kt-folder-status-grid">
        <div className="kt-folder-status-stat">
          <span className="kt-settings-row-title">Input folder</span>
          <p className="kt-settings-row-description">
            {input.enabled ? (input.configured ? 'Enabled and configured' : 'Enabled but not yet configured') : 'Disabled'}
          </p>
          <p className="kt-settings-row-description">
            Last poll: {input.last_poll ? formatDateTime(input.last_poll) : 'Never'}
          </p>
          <p className="kt-settings-row-description">
            Next poll: {input.next_poll ? formatDateTime(input.next_poll) : '—'}
          </p>
          <p className="kt-settings-row-description">Files processed today: {input.files_processed_today}</p>
        </div>

        <div className="kt-folder-status-stat">
          <span className="kt-settings-row-title">Output folder</span>
          <p className="kt-settings-row-description">
            {output.enabled ? (output.configured ? 'Enabled and configured' : 'Enabled but not yet configured') : 'Disabled'}
          </p>
          <p className="kt-settings-row-description">Files written today: {output.files_written_today}</p>
        </div>
      </div>

      <h3 className="kt-folder-activity-subheader">Recent activity</h3>
      {recentLog.length === 0 ? (
        <div className="kt-settings-coming-soon">No activity yet.</div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table className="kt-users-table kt-compact-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentLog.slice(0, 10).map((row) => (
                <tr key={row.id}>
                  <td title={row.filename}>{row.filename}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{formatDateTime(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" className="kt-category-link-button" onClick={onViewFullLog}>
        View full log
      </button>
    </div>
  )
}

export default function FolderIntegrationSettings({ token }) {
  const [config, setConfig] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFullLog, setShowFullLog] = useState(false)

  const load = () => {
    setError('')
    return Promise.all([folderApi.config(token), folderApi.status(token)])
      .then(([cfg, st]) => {
        setConfig(cfg)
        setStatus(st)
      })
      .catch((err) => setError(err.message || 'Failed to load Folder Integration settings'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div>
      <h2 className="kt-panel-title">Folder Integration</h2>
      <p className="kt-panel-subtitle">
        Automatically pick up new invoices from a watched folder, and save signed PDFs to an
        output folder. Supports local paths (mounted as Docker volumes) and SMB network shares.
      </p>

      {error && <div className="kt-auth-error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading || !config ? (
        <p className="kt-settings-row-status">Loading…</p>
      ) : (
        <>
          <InputFolderSection
            key={`input-${config.poll_interval}`}
            token={token}
            config={config.input}
            pollInterval={config.poll_interval}
            onSaved={load}
          />
          <OutputFolderSection
            key={`output-${config.output_behaviour}`}
            token={token}
            config={config.output}
            behaviour={config.output_behaviour}
            onSaved={load}
          />
          <FolderStatusPanel status={status} onViewFullLog={() => setShowFullLog(true)} />
        </>
      )}

      {showFullLog && <FullLogModal token={token} onClose={() => setShowFullLog(false)} />}
    </div>
  )
}
