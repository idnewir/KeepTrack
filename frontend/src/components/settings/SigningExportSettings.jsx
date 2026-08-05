import { useEffect, useState } from 'react'
import { settingsApi } from '../../utils/api.js'

export default function SigningExportSettings({ token }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <h2 className="kt-panel-title">Signing & Export</h2>
      <p className="kt-panel-subtitle">
        Control whether invoices go through a signing step before they're confirmed.
      </p>

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
            <span className="kt-settings-row-title">Free text on signed PDFs</span>
            <p className="kt-settings-row-description">
              When signing an invoice, users can add an optional line of free text alongside
              the signature and date — no separate setting needed, it's available whenever
              signing is turned on above.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
