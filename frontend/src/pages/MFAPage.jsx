import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function MFAPage() {
  const { hasPendingMfa, verifyMfa, mfaRememberHours } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [rememberSession, setRememberSession] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!hasPendingMfa) {
    return <Navigate to="/login" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await verifyMfa(code, rememberSession)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Invalid code')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Enter your authentication code"
      subtitle="Open your authenticator app and enter the current 6-digit code."
    >
      <form className="kt-auth-form" onSubmit={handleSubmit}>
        {error && <div className="kt-auth-error">{error}</div>}

        <div className="kt-field">
          <label htmlFor="code">6-digit code</label>
          <input
            id="code"
            className="kt-code-input"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            autoFocus
          />
        </div>

        <label className="kt-auth-checkbox-row">
          <input
            type="checkbox"
            checked={rememberSession}
            onChange={(e) => setRememberSession(e.target.checked)}
          />
          <span>
            Remember this session for {mfaRememberHours ?? 12} hour
            {mfaRememberHours === 1 ? '' : 's'}
          </span>
        </label>

        <button
          className="kt-auth-button"
          type="submit"
          disabled={submitting || code.length !== 6}
        >
          {submitting ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    </AuthCard>
  )
}
