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
  // Tracks which token `modules`/`isLoading` currently reflect. Deliberately
  // state, not a ref: this drives a render-phase adjustment (below), and
  // React only guarantees that pattern is pure/idempotent — safe under
  // Strict Mode's double-invoked renders — when built from state setters.
  // A ref mutated in the render body persists across that double-invoke and
  // desyncs the two calls, which is exactly the bug this replaced: it let
  // DebtTerminologyContext observe a stale isLoading:false for one commit
  // and fire GET /debts/terminology before the module list had loaded.
  const [loadedToken, setLoadedToken] = useState(undefined)

  // Flips isLoading back to true synchronously, within the render that
  // first sees a new token, rather than waiting for an effect. Consumers
  // like DebtTerminologyContext read isLoading from their *own* effect,
  // and child effects fire before this provider's effect in the same
  // commit — so if isLoading only flipped true inside our effect below, a
  // freshly-appeared token would leave those consumers reading yesterday's
  // (stale) isLoading:false/modules:{} for one commit, wrongly treating an
  // unloaded module as enabled and firing the API call regardless. See
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  if (loadedToken !== token) {
    setLoadedToken(token)
    setIsLoading(true)
  }

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
