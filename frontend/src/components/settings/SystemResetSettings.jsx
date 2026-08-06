import { useState } from 'react'
import { useAuth } from '../../hooks/AuthContext.jsx'
import { systemApi } from '../../utils/api.js'

const CONFIRMATION_PHRASE = 'RESET KEEP TRACK'

const DELETION_LIST = [
  'All invoices and uploaded files (if wipe files is selected)',
  'All contributions and reconciliations',
  'All planned projects',
  'All reports',
  'All users except the Superadmin account',
  'All settings (reset to defaults)',
  'All categories (reset to defaults)',
]

export default function SystemResetSettings() {
  const { user, logout } = useAuth()
  const token = user?.token
  const isSuperadmin = user?.role === 'superadmin'

  const [wipeFiles, setWipeFiles] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')

  const phraseMatches = phrase === CONFIRMATION_PHRASE
  const canSubmit = phraseMatches && password.length > 0 && !resetting

  const handleReset = async () => {
    if (!canSubmit) return
    setError('')
    setResetting(true)
    try {
      await systemApi.reset(
        { superadmin_password: password, confirmation_phrase: phrase, wipe_files: wipeFiles },
        token
      )
      // Full reload (not client-side navigation): every piece of in-memory
      // app state — terminology, auth context, cached lists — describes a
      // system that no longer exists after a reset. logout() clears the
      // stored token first so the reload lands on the setup wizard, not a
      // 401 loop.
      logout()
      window.location.href = '/setup'
    } catch (err) {
      setError(err.message || 'Failed to reset Keep Track')
      setResetting(false)
    }
  }

  if (!isSuperadmin) {
    return (
      <div>
        <h2 className="kt-panel-title kt-danger-title">System Reset</h2>
        <p className="kt-panel-subtitle">Irreversible, whole-system actions. Use with care.</p>
        <div className="kt-settings-coming-soon kt-danger-box">
          System reset is only available to the Superadmin account.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="kt-panel-title kt-danger-title">System Reset</h2>
      <p className="kt-panel-subtitle">Irreversible, whole-system actions. Use with care.</p>

      <div className="kt-danger-warning">
        <strong>This will permanently delete all data. This cannot be undone.</strong>
        <p>The following will be deleted:</p>
        <ul>
          {DELETION_LIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {error && (
        <div className="kt-auth-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      <div className="kt-danger-step">
        <span className="kt-settings-row-title">Step 1 — Wipe files</span>
        <button
          type="button"
          role="switch"
          aria-checked={wipeFiles}
          className={`kt-toggle${wipeFiles ? ' on' : ''}`}
          onClick={() => setWipeFiles((v) => !v)}
          disabled={resetting}
        >
          <span className="kt-toggle-track">
            <span className="kt-toggle-thumb" />
          </span>
          <span className="kt-toggle-label">{wipeFiles ? 'On' : 'Off'}</span>
        </button>
        <p className="kt-settings-row-description" style={{ marginTop: 8 }}>
          Also delete all uploaded PDF files from storage
        </p>
        {wipeFiles && (
          <p className="kt-danger-file-warning">
            This will permanently delete all original and signed PDFs. Make sure you have copies
            elsewhere before proceeding.
          </p>
        )}
      </div>

      <div className="kt-field kt-danger-step">
        <label htmlFor="reset-phrase">
          Step 2 — Type <code>RESET KEEP TRACK</code> to confirm
        </label>
        <input
          id="reset-phrase"
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          disabled={resetting}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {phraseMatches && (
        <div className="kt-field kt-danger-step">
          <label htmlFor="reset-password">Step 3 — Enter your Superadmin password</label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={resetting}
            autoComplete="current-password"
          />
        </div>
      )}

      <button
        type="button"
        className="kt-auth-button kt-danger-reset-button"
        onClick={handleReset}
        disabled={!canSubmit}
      >
        {resetting ? 'Resetting…' : 'Reset all data'}
      </button>
    </div>
  )
}
