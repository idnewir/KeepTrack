import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function LoginPage() {
  const { login, setupRequired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inactivityLogout = Boolean(location.state?.inactivityLogout)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { mfaRequired } = await login(username, password)
      navigate(mfaRequired ? '/mfa' : '/')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard title="Log in" subtitle="Enter your username and password to continue.">
      {setupRequired && (
        <div className="kt-login-setup-banner">
          <p>Welcome to Keep Track. No accounts exist yet.</p>
          <button
            type="button"
            className="kt-auth-button"
            onClick={() => navigate('/setup')}
          >
            Set up Keep Track
          </button>
        </div>
      )}

      <form className="kt-auth-form" onSubmit={handleSubmit}>
        {inactivityLogout && !error && (
          <div className="kt-auth-notice">
            You were logged out due to inactivity. Please log in again.
          </div>
        )}
        {error && <div className="kt-auth-error">{error}</div>}

        <div className="kt-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="kt-auth-button" type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="kt-auth-footer">
        Don't have an account? <Link to="/register">Register</Link>
      </p>
    </AuthCard>
  )
}
