import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { settingsApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'

// Matches backend's site_name default (services/settings_service.py's
// get_site_name) — shown before the fetch resolves, or if it fails.
const DEFAULT_SITE_NAME = 'Keep Track'

const SiteNameContext = createContext(null)

export function SiteNameProvider({ children }) {
  const { user } = useAuth()
  const token = user?.token

  const [siteName, setSiteName] = useState(DEFAULT_SITE_NAME)
  const [loading, setLoading] = useState(true)

  // site_name is a General setting (GET /settings), not part of
  // GET /settings/terminology — see docs/decisions-log.md.
  const refresh = useCallback(() => {
    if (!token) {
      setSiteName(DEFAULT_SITE_NAME)
      setLoading(false)
      return Promise.resolve()
    }
    return settingsApi
      .list(token)
      .then((rows) => {
        const row = rows.find((r) => r.key === 'site_name')
        setSiteName(row?.value || DEFAULT_SITE_NAME)
      })
      .catch(() => setSiteName(DEFAULT_SITE_NAME))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ siteName, loading, refresh }), [siteName, loading, refresh])

  return <SiteNameContext.Provider value={value}>{children}</SiteNameContext.Provider>
}

// Returns { siteName, loading, refresh }. Call refresh() after saving the
// Instance name field on Settings → General so the Header picks up the new
// value immediately, without a page reload.
export function useSiteName() {
  const ctx = useContext(SiteNameContext)
  if (!ctx) {
    throw new Error('useSiteName must be used within a SiteNameProvider')
  }
  return ctx
}
