import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { terminologyApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'

// Matches backend/services/settings_service.py's TERMINOLOGY_DEFAULTS — used
// before the fetch resolves (or if it fails) so every label-consuming
// component always has a sane string to render, never undefined. site_name
// is a General setting, not a term_* label — see SiteNameContext.jsx.
export const TERMINOLOGY_DEFAULTS = {
  term_expenses: 'Invoices',
  term_income: 'Contributions',
  term_projects: 'Projects',
  term_reconciliation: 'Reconciliation',
  term_reserve: 'Target Reserve',
}

const TerminologyContext = createContext(null)

export function TerminologyProvider({ children }) {
  const { user } = useAuth()
  const token = user?.token

  const [terminology, setTerminology] = useState(TERMINOLOGY_DEFAULTS)
  // Lets consumers (the Settings page's form) tell "still loading, these are
  // just placeholder defaults" apart from "loaded, and it turns out the
  // organisation's values really do match the defaults."
  const [loading, setLoading] = useState(true)

  // GET /settings/terminology requires an authenticated user (it's still
  // gated behind login, just not Admin-only), so pre-login pages (which
  // don't render the Sidebar/Header anyway) simply see the defaults.
  const refresh = useCallback(() => {
    if (!token) {
      setTerminology(TERMINOLOGY_DEFAULTS)
      setLoading(false)
      return Promise.resolve()
    }
    return terminologyApi
      .get(token)
      .then(setTerminology)
      .catch(() => setTerminology(TERMINOLOGY_DEFAULTS))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ ...terminology, loading, refresh }), [terminology, loading, refresh])

  return <TerminologyContext.Provider value={value}>{children}</TerminologyContext.Provider>
}

// Returns { term_expenses, term_income, term_projects, term_reconciliation,
// term_reserve, refresh }. Call refresh() after saving changes on the
// Settings page so the rest of the app (Sidebar, Header, Dashboard, etc.)
// picks up the new labels immediately, without a page reload.
export function useTerminology() {
  const ctx = useContext(TerminologyContext)
  if (!ctx) {
    throw new Error('useTerminology must be used within a TerminologyProvider')
  }
  return ctx
}
