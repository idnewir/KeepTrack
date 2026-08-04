import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { settingsApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function SettingsPage() {
  const { user } = useAuth()
  const token = user?.token

  const [signingEnabled, setSigningEnabled] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    settingsApi
      .list(token)
      .then((rows) => {
        const signing = rows.find((row) => row.key === 'signing_enabled')
        setSigningEnabled(signing ? signing.value === 'true' : true)
      })
      .catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [token])

  const handleToggleSigning = async () => {
    const next = !signingEnabled
    setError('')
    setSaving(true)
    try {
      await settingsApi.update('signing_enabled', next ? 'true' : 'false', token)
      setSigningEnabled(next)
    } catch (err) {
      setError(err.message || 'Failed to update setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="kt-page-title">Settings</h1>
      <p className="kt-page-subtitle">Configure how Keep Track behaves for everyone.</p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="kt-settings-list">
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Signing and export</span>
            <p className="kt-settings-row-description">
              When enabled, users will be asked to sign and date invoices before confirming
              them. Turn this off for personal use cases where signing is not required.
            </p>
          </div>
          {loading ? (
            <span className="kt-settings-row-status">Loading…</span>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(signingEnabled)}
              className={`kt-toggle${signingEnabled ? ' on' : ''}`}
              onClick={handleToggleSigning}
              disabled={saving}
            >
              <span className="kt-toggle-track">
                <span className="kt-toggle-thumb" />
              </span>
              <span className="kt-toggle-label">{signingEnabled ? 'On' : 'Off'}</span>
            </button>
          )}
        </div>

        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Categories</span>
            <p className="kt-settings-row-description">
              Add, rename, recolour, or deactivate the categories used to classify invoices.
            </p>
          </div>
          <Link to="/settings/categories" className="kt-auth-button kt-settings-link-button">
            Manage categories
          </Link>
        </div>
      </div>
    </div>
  )
}
