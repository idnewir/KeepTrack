import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { authApi } from '../utils/api.js'
import { MONTH_NAMES } from '../utils/format.js'

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const AI_PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Self-hosted (Ollama)' },
]

export default function SetupPage() {
  const { completeSetup, markSetupComplete } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('form') // 'form' | 'qr' | 'start-date' | 'ai' | 'done'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [setupData, setSetupData] = useState(null)

  const [startMonth, setStartMonth] = useState(currentMonthValue)
  const [fyStartMonth, setFyStartMonth] = useState(9) // 1-12, defaults to September
  const [savingStartDate, setSavingStartDate] = useState(false)
  const [startDateError, setStartDateError] = useState('')

  const [aiProvider, setAiProvider] = useState('anthropic')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiEndpointUrl, setAiEndpointUrl] = useState('')
  const [savingAiConfig, setSavingAiConfig] = useState(false)
  const [aiConfigError, setAiConfigError] = useState('')

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
        <button className="kt-auth-button" type="button" onClick={() => setStep('start-date')}>
          I've scanned it — continue
        </button>
      </AuthCard>
    )
  }

  if (step === 'start-date') {
    const saveStartDate = async (appStartDate) => {
      setStartDateError('')
      setSavingStartDate(true)
      try {
        await authApi.setupAppStartDate(appStartDate, fyStartMonth)
        setStep('ai')
      } catch (err) {
        setStartDateError(err.message || 'Failed to save')
      } finally {
        setSavingStartDate(false)
      }
    }

    return (
      <AuthCard
        title="When did you start using Keep Track?"
        subtitle="We will only show data from this date onwards. You can change this later in Settings."
      >
        {startDateError && <div className="kt-auth-error">{startDateError}</div>}
        <form
          className="kt-auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            saveStartDate(`${startMonth}-01`)
          }}
        >
          <div className="kt-field">
            <label htmlFor="app-start-month">Start month</label>
            <input
              id="app-start-month"
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              required
            />
          </div>

          <div className="kt-field">
            <label htmlFor="fy-start-month">When does your financial year start?</label>
            <select
              id="fy-start-month"
              value={fyStartMonth}
              onChange={(e) => setFyStartMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <p className="kt-auth-subtitle" style={{ marginTop: 6 }}>
              This is the month your financial year begins. For example, many UK charities use
              September. You can change this later in Settings.
            </p>
          </div>

          <button className="kt-auth-button" type="submit" disabled={savingStartDate}>
            {savingStartDate ? 'Saving…' : 'Confirm'}
          </button>
          <button
            className="kt-auth-button kt-auth-button-secondary"
            type="button"
            disabled={savingStartDate}
            onClick={() => saveStartDate(null)}
          >
            Skip for now
          </button>
        </form>
      </AuthCard>
    )
  }

  if (step === 'ai') {
    const isOllama = aiProvider === 'ollama'

    const handleSaveAiConfig = async () => {
      setAiConfigError('')
      if (isOllama && !aiEndpointUrl.trim()) {
        setAiConfigError('Enter an endpoint URL for your self-hosted model')
        return
      }
      setSavingAiConfig(true)
      try {
        await authApi.setupAiConfig({
          provider: aiProvider,
          api_key: isOllama ? null : aiApiKey.trim() || null,
          endpoint_url: isOllama ? aiEndpointUrl.trim() : null,
          ai_enabled: true,
        })
        setStep('done')
      } catch (err) {
        setAiConfigError(err.message || 'Failed to save AI configuration')
      } finally {
        setSavingAiConfig(false)
      }
    }

    return (
      <AuthCard
        title="Configure AI features (optional)"
        subtitle="AI powers automatic invoice data extraction and report summaries. You can use
          Anthropic, OpenAI, or a self-hosted model. Skip this step to configure later."
      >
        {aiConfigError && <div className="kt-auth-error">{aiConfigError}</div>}
        <form
          className="kt-auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            handleSaveAiConfig()
          }}
        >
          <div className="kt-field">
            <label htmlFor="ai-setup-provider">AI provider</label>
            <select
              id="ai-setup-provider"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
            >
              {AI_PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {isOllama ? (
            <div className="kt-field">
              <label htmlFor="ai-setup-endpoint">Endpoint URL</label>
              <input
                id="ai-setup-endpoint"
                type="text"
                placeholder="http://192.168.1.100:11434"
                value={aiEndpointUrl}
                onChange={(e) => setAiEndpointUrl(e.target.value)}
              />
            </div>
          ) : (
            <div className="kt-field">
              <label htmlFor="ai-setup-key">API key</label>
              <input
                id="ai-setup-key"
                type="password"
                placeholder="Optional — can be added later in Settings"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          <button className="kt-auth-button" type="submit" disabled={savingAiConfig}>
            {savingAiConfig ? 'Saving…' : 'Save and continue'}
          </button>
          <button
            className="kt-auth-button kt-auth-button-secondary"
            type="button"
            disabled={savingAiConfig}
            onClick={() => setStep('done')}
          >
            Skip for now
          </button>
        </form>
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
