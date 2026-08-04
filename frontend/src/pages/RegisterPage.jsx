import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('form') // 'form' | 'mfa-setup'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mfaData, setMfaData] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      const data = await register(username, email, password)
      setMfaData(data)
      setStep('mfa-setup')
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'mfa-setup' && mfaData) {
    return (
      <AuthCard
        title="Set up your authenticator app"
        subtitle="Scan this QR code now — you'll need it to log in once an Admin approves your account."
      >
        <div className="kt-auth-qr">
          <img
            src={`data:image/png;base64,${mfaData.qr_code_png_base64}`}
            alt="MFA QR code"
          />
        </div>
        <p className="kt-auth-subtitle" style={{ marginBottom: 8 }}>
          Can't scan? Enter this code manually:
        </p>
        <div className="kt-auth-secret">{mfaData.mfa_secret}</div>
        <button
          className="kt-auth-button"
          type="button"
          onClick={() => navigate('/pending-approval')}
        >
          I've saved it — continue
        </button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle="Your account will need approval from an Admin before you can log in."
    >
      <form className="kt-auth-form" onSubmit={handleSubmit}>
        {error && <div className="kt-auth-error">{error}</div>}

        <div className="kt-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            minLength={3}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <div className="kt-auth-note">
          After registering, an Admin will need to review and approve your
          account before you can log in.
        </div>

        <button className="kt-auth-button" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Register'}
        </button>
      </form>

      <p className="kt-auth-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthCard>
  )
}
