import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function SetupPage() {
  const { completeSetup, markSetupComplete } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('form') // 'form' | 'qr' | 'done'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [setupData, setSetupData] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      const data = await completeSetup(username, email, password)
      setSetupData(data)
      setStep('qr')
    } catch (err) {
      setError(err.message || 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'qr' && setupData) {
    return (
      <AuthCard
        title="Scan with your authenticator app"
        subtitle="Use Google Authenticator, Authy, or a similar app to scan this code."
      >
        <div className="kt-auth-qr">
          <img
            src={`data:image/png;base64,${setupData.qr_code_png_base64}`}
            alt="MFA QR code"
          />
        </div>
        <p className="kt-auth-subtitle" style={{ marginBottom: 8 }}>
          Can't scan? Enter this code manually:
        </p>
        <div className="kt-auth-secret">{setupData.mfa_secret}</div>
        <button className="kt-auth-button" type="button" onClick={() => setStep('done')}>
          I've scanned it — continue
        </button>
      </AuthCard>
    )
  }

  if (step === 'done') {
    return (
      <AuthCard title="Setup complete" subtitle="Your Admin account is ready to use.">
        <button
          className="kt-auth-button"
          type="button"
          onClick={() => {
            markSetupComplete()
            navigate('/login')
          }}
        >
          Continue to login
        </button>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Welcome to Keep Track"
      subtitle="Let's create the first Admin account to get started."
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

        <button className="kt-auth-button" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create Admin account'}
        </button>
      </form>
    </AuthCard>
  )
}
