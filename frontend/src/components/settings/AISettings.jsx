import { useEffect, useState } from 'react'
import { aiApi } from '../../utils/api.js'

const CLOUD_PROVIDERS = ['anthropic', 'openai', 'google', 'xai', 'mistral', 'cohere']
const FREE_TEXT_PROVIDERS = ['ollama', 'custom']

const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic (recommended)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'xai', label: 'xAI Grok' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'ollama', label: 'Ollama (self-hosted)' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
]

export default function AISettings({ token }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modelsCatalog, setModelsCatalog] = useState({})

  const [enabledInput, setEnabledInput] = useState(true)
  const [providerInput, setProviderInput] = useState('anthropic')
  const [modelInput, setModelInput] = useState('')
  const [endpointUrlInput, setEndpointUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [changingKey, setChangingKey] = useState(false)

  const [apiKeySet, setApiKeySet] = useState(false)
  const [apiKeySource, setApiKeySource] = useState('none')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testError, setTestError] = useState('')

  const [fetchingModels, setFetchingModels] = useState(false)

  const applyConfig = (cfg) => {
    setEnabledInput(cfg.ai_enabled)
    setProviderInput(cfg.provider)
    setModelInput(cfg.model || '')
    setEndpointUrlInput(cfg.endpoint_url || '')
    setApiKeySet(cfg.api_key_set)
    setApiKeySource(cfg.api_key_source)
    setChangingKey(false)
    setApiKeyInput('')
  }

  const load = () => {
    setLoading(true)
    setLoadError('')
    return Promise.all([aiApi.getConfig(token), aiApi.models(null, token)])
      .then(([cfg, models]) => {
        applyConfig(cfg)
        setModelsCatalog(models)
      })
      .catch((err) => setLoadError(err.message || 'Failed to load AI configuration'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleProviderChange = (nextProvider) => {
    setProviderInput(nextProvider)
    setSaveSuccess(false)
    setTestResult(null)
    if (CLOUD_PROVIDERS.includes(nextProvider)) {
      const catalog = modelsCatalog[nextProvider]?.models || []
      setModelInput(catalog[0] || '')
    } else {
      setModelInput('')
    }
    if (nextProvider !== 'ollama' && nextProvider !== 'custom') {
      setEndpointUrlInput('')
    }
  }

  const handleFetchOllamaModels = async () => {
    setFetchingModels(true)
    try {
      const models = await aiApi.models(endpointUrlInput, token)
      setModelsCatalog((prev) => ({ ...prev, ollama: models.ollama }))
      if (!modelInput && models.ollama?.models?.length) {
        setModelInput(models.ollama.models[0])
      }
    } catch (err) {
      setModelsCatalog((prev) => ({
        ...prev,
        ollama: { models: [], note: err.message || 'Could not reach this endpoint' },
      }))
    } finally {
      setFetchingModels(false)
    }
  }

  const handleSave = async () => {
    setSaveError('')
    setSaveSuccess(false)
    setSaving(true)
    try {
      const payload = {
        provider: providerInput,
        model: modelInput.trim() || null,
        endpoint_url: endpointUrlInput.trim() || null,
        ai_enabled: enabledInput,
      }
      if (changingKey && apiKeyInput.trim()) {
        payload.api_key = apiKeyInput.trim()
      }
      const cfg = await aiApi.updateConfig(payload, token)
      applyConfig(cfg)
      setSaveSuccess(true)
      setTestResult(null)
    } catch (err) {
      setSaveError(err.message || 'Failed to save AI configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestError('')
    setTestResult(null)
    try {
      const result = await aiApi.test(token)
      setTestResult(result)
    } catch (err) {
      setTestError(err.message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="kt-panel-title">AI & Extraction</h2>
        <p className="kt-settings-row-status">Loading…</p>
      </div>
    )
  }

  const isCloudProvider = CLOUD_PROVIDERS.includes(providerInput)
  const isOllama = providerInput === 'ollama'
  const isCustom = providerInput === 'custom'
  const catalogModels = modelsCatalog[providerInput]?.models || []
  const catalogNote = modelsCatalog[providerInput]?.note

  return (
    <div>
      <h2 className="kt-panel-title">AI & Extraction</h2>
      <p className="kt-panel-subtitle">
        Configure how Keep Track uses AI to read invoices and write report summaries.
      </p>

      {loadError && <div className="kt-auth-error" style={{ marginBottom: 20 }}>{loadError}</div>}
      {saveError && <div className="kt-auth-error" style={{ marginBottom: 20 }}>{saveError}</div>}

      <div className="kt-settings-list" style={{ marginBottom: 28 }}>
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Enable AI features</span>
            <p className="kt-settings-row-description">
              When enabled, Keep Track uses AI to automatically extract data from uploaded
              invoices and generate report summaries. When disabled, all fields must be filled
              in manually.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabledInput}
            className={`kt-toggle${enabledInput ? ' on' : ''}`}
            onClick={() => {
              setEnabledInput((v) => !v)
              setSaveSuccess(false)
            }}
          >
            <span className="kt-toggle-track">
              <span className="kt-toggle-thumb" />
            </span>
            <span className="kt-toggle-label">{enabledInput ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {!isOllama && apiKeySource === 'environment' && (
        <div className="kt-ai-banner kt-ai-banner-info" style={{ marginBottom: 20 }}>
          Using API key from environment variable. Configure a key here to override it.
        </div>
      )}
      {!isOllama && apiKeySource === 'database' && (
        <div className="kt-ai-badge kt-ai-badge-success" style={{ marginBottom: 20 }}>
          API key configured
        </div>
      )}
      {!isOllama && apiKeySource === 'none' && (
        <div className="kt-ai-badge kt-ai-badge-warning" style={{ marginBottom: 20 }}>
          No API key configured — AI features unavailable
        </div>
      )}

      <div className="kt-settings-list" style={{ marginBottom: 20 }}>
        <div className="kt-settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="kt-settings-row-text" style={{ marginBottom: 16 }}>
            <span className="kt-settings-row-title">Provider</span>
            <p className="kt-settings-row-description">
              Choose which AI provider extracts invoice data and writes report summaries.
            </p>
          </div>

          <div className="kt-field" style={{ maxWidth: 360, marginBottom: 20 }}>
            <label htmlFor="ai-provider">Provider</label>
            <select
              id="ai-provider"
              value={providerInput}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {isCloudProvider && (
            <>
              <div className="kt-field" style={{ maxWidth: 420, marginBottom: 16 }}>
                <label htmlFor="ai-api-key">API key</label>
                {apiKeySet && !changingKey ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="password" value="••••••••••••••••" disabled readOnly />
                    <button
                      type="button"
                      className="kt-category-link-button"
                      onClick={() => setChangingKey(true)}
                    >
                      Change API key
                    </button>
                  </div>
                ) : (
                  <input
                    id="ai-api-key"
                    type="password"
                    value={apiKeyInput}
                    placeholder="Enter API key"
                    autoComplete="off"
                    onChange={(e) => {
                      setApiKeyInput(e.target.value)
                      setChangingKey(true)
                    }}
                  />
                )}
                <p className="kt-field-note" style={{ marginTop: 6 }}>
                  Your API key is encrypted before storage and never displayed after saving.
                </p>
              </div>

              <div className="kt-field" style={{ maxWidth: 360 }}>
                <label htmlFor="ai-model">Model</label>
                <select id="ai-model" value={modelInput} onChange={(e) => setModelInput(e.target.value)}>
                  {catalogModels.length === 0 && <option value="">No models available</option>}
                  {catalogModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {catalogNote && <p className="kt-field-note" style={{ marginTop: 6 }}>{catalogNote}</p>}
              </div>
            </>
          )}

          {isOllama && (
            <>
              <div className="kt-field" style={{ maxWidth: 420, marginBottom: 16 }}>
                <label htmlFor="ai-endpoint-url">Endpoint URL</label>
                <input
                  id="ai-endpoint-url"
                  type="text"
                  placeholder="http://192.168.1.100:11434"
                  value={endpointUrlInput}
                  onChange={(e) => setEndpointUrlInput(e.target.value)}
                />
              </div>

              <div className="kt-field" style={{ maxWidth: 420, marginBottom: 8 }}>
                <label htmlFor="ai-model-ollama">Model</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="ai-model-ollama"
                    type="text"
                    placeholder="llama3"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    list="ollama-models-list"
                    style={{ flex: 1 }}
                  />
                  <datalist id="ollama-models-list">
                    {catalogModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={handleFetchOllamaModels}
                    disabled={fetchingModels || !endpointUrlInput.trim()}
                  >
                    {fetchingModels ? 'Checking…' : 'Fetch installed models'}
                  </button>
                </div>
                {catalogNote && <p className="kt-field-note" style={{ marginTop: 6 }}>{catalogNote}</p>}
              </div>

              <p className="kt-field-note">No API key required for Ollama.</p>
            </>
          )}

          {isCustom && (
            <>
              <div className="kt-field" style={{ maxWidth: 420, marginBottom: 16 }}>
                <label htmlFor="ai-endpoint-url-custom">Endpoint URL</label>
                <input
                  id="ai-endpoint-url-custom"
                  type="text"
                  placeholder="https://your-endpoint.example.com/v1"
                  value={endpointUrlInput}
                  onChange={(e) => setEndpointUrlInput(e.target.value)}
                />
              </div>

              <div className="kt-field" style={{ maxWidth: 420, marginBottom: 16 }}>
                <label htmlFor="ai-api-key-custom">API key (optional)</label>
                {apiKeySet && !changingKey ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="password" value="••••••••••••••••" disabled readOnly />
                    <button
                      type="button"
                      className="kt-category-link-button"
                      onClick={() => setChangingKey(true)}
                    >
                      Change API key
                    </button>
                  </div>
                ) : (
                  <input
                    id="ai-api-key-custom"
                    type="password"
                    value={apiKeyInput}
                    placeholder="Enter API key (if required)"
                    autoComplete="off"
                    onChange={(e) => {
                      setApiKeyInput(e.target.value)
                      setChangingKey(true)
                    }}
                  />
                )}
              </div>

              <div className="kt-field" style={{ maxWidth: 420, marginBottom: 8 }}>
                <label htmlFor="ai-model-custom">Model</label>
                <input
                  id="ai-model-custom"
                  type="text"
                  placeholder="model-name"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                />
              </div>

              <p className="kt-field-note">Must be compatible with the OpenAI API format.</p>
            </>
          )}
        </div>
      </div>

      {saveSuccess && (
        <p className="kt-profile-success" style={{ marginBottom: 16 }}>
          AI configuration saved.
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
        <button type="button" className="kt-auth-button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="kt-auth-button-secondary"
          onClick={handleTest}
          disabled={testing || saving}
        >
          {testing ? (
            <>
              <span className="kt-ai-test-spinner" /> Testing…
            </>
          ) : (
            'Test connection'
          )}
        </button>
      </div>

      {testError && <div className="kt-auth-error" style={{ marginBottom: 16 }}>{testError}</div>}

      {testResult && (
        <div
          className={`kt-ai-test-result${testResult.success ? ' kt-ai-test-success' : ' kt-ai-test-failure'}`}
        >
          {testResult.success ? (
            <>
              ✓ Connected successfully
              {testResult.response_time_ms != null && ` (${testResult.response_time_ms}ms)`}
              {testResult.model_used && ` — ${testResult.model_used}`}
            </>
          ) : (
            <>✗ {testResult.error || 'Connection failed'}</>
          )}
        </div>
      )}
    </div>
  )
}
