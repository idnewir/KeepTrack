import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/AuthContext.jsx'
import { useModules } from '../../context/ModulesContext.jsx'
import { modulesApi } from '../../utils/api.js'

// One setup prompt per requires_setup module — shown right after an Admin
// switches it on. Text and the "Go to settings" destination are specific to
// each module (per this feature's brief); debt_tracking/budget_planning
// additionally let the Admin rename the module on the spot, since neither
// has an obvious universal name.
const SETUP_PROMPTS = {
  ai_extraction: {
    body: 'AI Extraction needs an API key to work.',
    settingsPath: '/settings?section=ai',
    settingsLabel: 'Go to Settings → AI & Extraction',
  },
  folder_integration: {
    body: 'Configure your input and output folder paths.',
    settingsPath: '/settings?section=folder',
    settingsLabel: 'Go to Settings → Data → Folder Integration',
  },
  debt_tracking: { renamable: true },
  budget_planning: { renamable: true },
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4000)
    return () => window.clearTimeout(timer)
  }, [onDone])
  return (
    <div className="kt-module-toast" role="status">
      {message}
    </div>
  )
}

export default function FeatureModulesSettings({ token }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { refresh: refreshModules } = useModules()

  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [toast, setToast] = useState(null)
  const [disableConfirm, setDisableConfirm] = useState(null) // module object
  const [setupPrompt, setSetupPrompt] = useState(null) // module object
  const [renameInput, setRenameInput] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  const loadModules = () => {
    setLoading(true)
    setError('')
    return modulesApi
      .list(token)
      .then(setModules)
      .catch((err) => setError(err.message || 'Failed to load feature modules'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadModules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const applyToggle = (moduleKey, enabled) => {
    setModules((prev) => prev.map((m) => (m.module_key === moduleKey ? { ...m, enabled } : m)))
  }

  const doEnable = async (module) => {
    setBusyKey(module.module_key)
    setError('')
    applyToggle(module.module_key, true) // optimistic update
    try {
      await modulesApi.update(module.module_key, true, token)
      setToast(`${module.label} enabled — ${module.description}`)
      refreshModules()
      if (module.requires_setup) {
        setRenameInput(module.label)
        setSetupPrompt(module)
      }
    } catch (err) {
      applyToggle(module.module_key, false) // roll back
      setError(err.message || `Failed to enable ${module.label}`)
    } finally {
      setBusyKey(null)
    }
  }

  const doDisable = async (module) => {
    setBusyKey(module.module_key)
    setError('')
    applyToggle(module.module_key, false) // optimistic update
    try {
      await modulesApi.update(module.module_key, false, token)
      setToast(`${module.label} disabled`)
      refreshModules()
    } catch (err) {
      applyToggle(module.module_key, true) // roll back
      setError(err.message || `Failed to disable ${module.label}`)
    } finally {
      setBusyKey(null)
      setDisableConfirm(null)
    }
  }

  const handleToggleClick = (module) => {
    if (!isAdmin || busyKey) return
    if (module.enabled) {
      setDisableConfirm(module)
    } else {
      doEnable(module)
    }
  }

  const handleSaveRename = async () => {
    if (!setupPrompt || !renameInput.trim()) return
    setRenameSaving(true)
    try {
      const updated = await modulesApi.rename(setupPrompt.module_key, renameInput.trim(), token)
      setModules((prev) => prev.map((m) => (m.module_key === updated.module_key ? updated : m)))
      setSetupPrompt(null)
    } catch (err) {
      setError(err.message || 'Failed to rename module')
    } finally {
      setRenameSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <h2 className="kt-panel-title">Feature Modules</h2>
        <p className="kt-panel-subtitle">
          Modules control which features are visible in Keep Track. Contact your Administrator to
          change feature settings.
        </p>
        {loading ? (
          <span className="kt-settings-row-status">Loading…</span>
        ) : (
          <ModuleList modules={modules} isAdmin={false} onToggleClick={() => {}} busyKey={null} />
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 className="kt-panel-title">Feature Modules</h2>
      <p className="kt-panel-subtitle">
        Turn feature areas on or off for everyone. Disabling a module hides it from navigation —
        your data is always kept safe.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <span className="kt-settings-row-status">Loading…</span>
      ) : (
        <ModuleList modules={modules} isAdmin onToggleClick={handleToggleClick} busyKey={busyKey} />
      )}

      <p className="kt-field-note" style={{ marginTop: 16 }}>
        Modules control which features are visible in Keep Track. Disabling a module hides it from
        navigation but never deletes your data. Re-enabling a module restores full access
        instantly.
      </p>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {disableConfirm && (
        <div className="kt-modal-overlay" onClick={() => setDisableConfirm(null)}>
          <div className="kt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kt-modal-header">
              <h3 className="kt-modal-title">Disable {disableConfirm.label}?</h3>
              <button
                type="button"
                className="kt-modal-close"
                aria-label="Close"
                onClick={() => setDisableConfirm(null)}
              >
                ×
              </button>
            </div>
            <div className="kt-modal-body">
              <p>
                {disableConfirm.label} will be hidden from navigation. Your data will not be
                deleted and can be restored by re-enabling this module.
              </p>
              <div className="kt-modal-actions">
                <button type="button" className="kt-category-link-button" onClick={() => setDisableConfirm(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="kt-auth-button kt-category-danger"
                  onClick={() => doDisable(disableConfirm)}
                  disabled={busyKey === disableConfirm.module_key}
                >
                  {busyKey === disableConfirm.module_key ? 'Disabling…' : 'Disable'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {setupPrompt && (
        <div className="kt-modal-overlay" onClick={() => setSetupPrompt(null)}>
          <div className="kt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kt-modal-header">
              <h3 className="kt-modal-title">Set up {setupPrompt.label}</h3>
              <button
                type="button"
                className="kt-modal-close"
                aria-label="Close"
                onClick={() => setSetupPrompt(null)}
              >
                ×
              </button>
            </div>
            <div className="kt-modal-body">
              {SETUP_PROMPTS[setupPrompt.module_key]?.renamable ? (
                <>
                  <p>What would you like to call this module?</p>
                  <div className="kt-field" style={{ marginBottom: 16 }}>
                    <input
                      type="text"
                      maxLength={100}
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                    />
                  </div>
                  <div className="kt-modal-actions">
                    <button type="button" className="kt-category-link-button" onClick={() => setSetupPrompt(null)}>
                      Skip for now
                    </button>
                    <button
                      type="button"
                      className="kt-auth-button"
                      onClick={handleSaveRename}
                      disabled={renameSaving || !renameInput.trim()}
                    >
                      {renameSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{SETUP_PROMPTS[setupPrompt.module_key]?.body || `${setupPrompt.label} needs a little setup.`}</p>
                  <div className="kt-modal-actions">
                    <button type="button" className="kt-category-link-button" onClick={() => setSetupPrompt(null)}>
                      Skip for now
                    </button>
                    <button
                      type="button"
                      className="kt-auth-button"
                      onClick={() => {
                        const path = SETUP_PROMPTS[setupPrompt.module_key]?.settingsPath
                        setSetupPrompt(null)
                        if (path) navigate(path)
                      }}
                    >
                      {SETUP_PROMPTS[setupPrompt.module_key]?.settingsLabel || 'Go to settings'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModuleList({ modules, isAdmin, onToggleClick, busyKey }) {
  if (modules.length === 0) return null
  return (
    <div className="kt-settings-list">
      {modules.map((module) => (
        <div className="kt-settings-row" key={module.module_key}>
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">{module.label}</span>
            <p className="kt-settings-row-description">{module.description}</p>
          </div>
          <div className="kt-settings-row-control" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className={`kt-module-status kt-module-status-${module.enabled ? 'active' : 'inactive'}`}>
              {module.enabled ? 'Active' : 'Inactive'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={module.enabled}
              aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${module.label}`}
              className={`kt-toggle${module.enabled ? ' on' : ''}`}
              onClick={() => onToggleClick(module)}
              disabled={!isAdmin || busyKey === module.module_key}
            >
              <span className="kt-toggle-track">
                <span className="kt-toggle-thumb" />
              </span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
