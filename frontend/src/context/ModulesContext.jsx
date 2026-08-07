import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { modulesApi, notificationsApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'

const POLL_INTERVAL_MS = 30000

const ModulesContext = createContext(null)

export function ModulesProvider({ children }) {
  const { user } = useAuth()
  const token = user?.token

  // module_key -> enabled. Deliberately just the enabled flags (the same
  // shape GET /notifications/count's `modules` object carries) — full
  // module records (label, description, requires_setup) are only needed by
  // the Settings → General module list, which fetches GET /modules directly
  // rather than through this context.
  const [modules, setModules] = useState({})
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(() => {
    if (!token) {
      setModules({})
      setIsLoading(false)
      return Promise.resolve()
    }
    return modulesApi
      .list(token)
      .then((rows) => {
        const state = {}
        rows.forEach((m) => {
          state[m.module_key] = m.enabled
        })
        setModules(state)
      })
      .catch(() => setModules({}))
      .finally(() => setIsLoading(false))
  }, [token])

  useEffect(() => {
    setIsLoading(true)
    refresh()
  }, [refresh])

  // Picks up module toggles made elsewhere (another tab, another admin's
  // session) on the same 30s cadence the header notification bell already
  // polls GET /notifications/count at — see docs/decisions-log.md for why
  // module state piggybacks on that endpoint rather than its own poll.
  useEffect(() => {
    if (!token) return undefined
    const interval = window.setInterval(() => {
      notificationsApi
        .count(token)
        .then((data) => {
          if (data.modules) setModules(data.modules)
        })
        .catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [token])

  // Defaults to enabled for a key not yet loaded/known — matches the
  // backend's own is_enabled() fallback, so a slow first load never flashes
  // features into hiding before GET /modules resolves.
  const isEnabled = useCallback((moduleKey) => modules[moduleKey] !== false, [modules])

  const value = useMemo(
    () => ({ modules, isEnabled, isLoading, refresh }),
    [modules, isEnabled, isLoading, refresh]
  )

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>
}

// Returns { modules, isEnabled(moduleKey), isLoading, refresh }. Call
// refresh() after toggling a module on the Settings page for an immediate
// update, rather than waiting for the next 30s poll.
export function useModules() {
  const ctx = useContext(ModulesContext)
  if (!ctx) {
    throw new Error('useModules must be used within a ModulesProvider')
  }
  return ctx
}
