import { useEffect, useState } from 'react'
import { settingsApi } from '../../utils/api.js'
import SigningExportSettings from './SigningExportSettings.jsx'

const SESSION_TIMEOUT_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
  { value: '0', label: 'Never' },
]

const MFA_REMEMBER_OPTIONS = [
  { value: '4', label: '4 hours' },
  { value: '8', label: '8 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '168', label: '7 days' },
]

const SESSION_TIMEOUT_DEFAULT = '120'
const MFA_REMEMBER_DEFAULT = '12'

export default function SecuritySettings({ token }) {
  const [sessionTimeout, setSessionTimeout] = useState(SESSION_TIMEOUT_DEFAULT)
  const [sessionTimeoutInput, setSessionTimeoutInput] = useState(SESSION_TIMEOUT_DEFAULT)
  const [savingSessionTimeout, setSavingSessionTimeout] = useState(false)
  const [sessionTimeoutError, setSessionTimeoutError] = useState('')

  const [mfaRememberHours, setMfaRememberHours] = useState(MFA_REMEMBER_DEFAULT)
  const [mfaRememberHoursInput, setMfaRememberHoursInput] = useState(MFA_REMEMBER_DEFAULT)
  const [savingMfaRememberHours, setSavingMfaRememberHours] = useState(false)
  const [mfaRememberHoursError, setMfaRememberHoursError] = useState('')

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    settingsApi
      .list(token)
      .then((rows) => {
        const timeout = rows.find((row) => row.key === 'session_timeout_minutes')
        const timeoutValue = timeout?.value || SESSION_TIMEOUT_DEFAULT
        setSessionTimeout(timeoutValue)
        setSessionTimeoutInput(timeoutValue)

        const remember = rows.find((row) => row.key === 'mfa_remember_hours')
        const rememberValue = remember?.value || MFA_REMEMBER_DEFAULT
        setMfaRememberHours(rememberValue)
        setMfaRememberHoursInput(rememberValue)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleSaveSessionTimeout = async () => {
    setSessionTimeoutError('')
    setSavingSessionTimeout(true)
    try {
      await settingsApi.update('session_timeout_minutes', sessionTimeoutInput, token)
      setSessionTimeout(sessionTimeoutInput)
    } catch (err) {
      setSessionTimeoutError(err.message || 'Failed to save session timeout')
    } finally {
      setSavingSessionTimeout(false)
    }
  }

  const handleSaveMfaRememberHours = async () => {
    setMfaRememberHoursError('')
    setSavingMfaRememberHours(true)
    try {
      await settingsApi.update('mfa_remember_hours', mfaRememberHoursInput, token)
      setMfaRememberHours(mfaRememberHoursInput)
    } catch (err) {
      setMfaRememberHoursError(err.message || 'Failed to save MFA remember duration')
    } finally {
      setSavingMfaRememberHours(false)
    }
  }

  return (
    <div>
      <h2 className="kt-panel-title">Security</h2>
      <p className="kt-panel-subtitle">Signing, session, and multi-factor authentication controls.</p>

      <SigningExportSettings token={token} />

      <div className="kt-settings-list" style={{ marginTop: 32 }}>
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Session timeout</span>
            <p className="kt-settings-row-description">
              Users will be logged out after this period of inactivity. A warning is shown 5
              minutes before timeout.
            </p>
            {sessionTimeoutError && (
              <div className="kt-auth-error" style={{ marginTop: 8 }}>{sessionTimeoutError}</div>
            )}
          </div>
          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <div className="kt-settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={sessionTimeoutInput}
                onChange={(e) => setSessionTimeoutInput(e.target.value)}
                disabled={savingSessionTimeout}
              >
                {SESSION_TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="kt-category-link-button"
                onClick={handleSaveSessionTimeout}
                disabled={savingSessionTimeout || sessionTimeoutInput === sessionTimeout}
              >
                {savingSessionTimeout ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">MFA remember duration</span>
            <p className="kt-settings-row-description">
              When a user chooses to remember their MFA verification, how long before they need
              to verify again.
            </p>
            {mfaRememberHoursError && (
              <div className="kt-auth-error" style={{ marginTop: 8 }}>{mfaRememberHoursError}</div>
            )}
          </div>
          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <div className="kt-settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={mfaRememberHoursInput}
                onChange={(e) => setMfaRememberHoursInput(e.target.value)}
                disabled={savingMfaRememberHours}
              >
                {MFA_REMEMBER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="kt-category-link-button"
                onClick={handleSaveMfaRememberHours}
                disabled={savingMfaRememberHours || mfaRememberHoursInput === mfaRememberHours}
              >
                {savingMfaRememberHours ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <p className="kt-settings-row-description" style={{ padding: '4px 16px 16px' }}>
          Changes apply to new sessions. Existing sessions are not affected.
        </p>
      </div>
    </div>
  )
}
