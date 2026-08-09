import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { debtsApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useModules } from './ModulesContext.jsx'

// Matches backend/services/debt_service.py's DEBT_TERMINOLOGY_DEFAULTS.
export const DEBT_TERMINOLOGY_DEFAULTS = {
  debt_term_module: 'Debt Tracking',
  debt_term_debt: 'Debt',
  debt_term_payment: 'Payment',
}

const DebtTerminologyContext = createContext(null)

export function DebtTerminologyProvider({ children }) {
  const { user } = useAuth()
  const token = user?.token
  const { isEnabled, isLoading: modulesLoading } = useModules()
  const debtTrackingEnabled = isEnabled('debt_tracking')

  const [terminology, setTerminology] = useState(DEBT_TERMINOLOGY_DEFAULTS)
  const [loading, setLoading] = useState(true)

  // GET /debts/terminology is gated behind the debt_tracking module (like
  // every other /debts endpoint) — skipped entirely while the module is off
  // so disabled deployments never see a 403 in the console, same reasoning
  // as ModulesContext's own token guard. Also waits for ModulesContext to
  // finish its own load: isEnabled() defaults an unknown module to `true`,
  // so firing before modules have loaded could hit the API while the module
  // is actually disabled, producing the same 403.
  const refresh = useCallback(() => {
    if (!token) {
      setTerminology(DEBT_TERMINOLOGY_DEFAULTS)
      setLoading(false)
      return Promise.resolve()
    }
    if (modulesLoading) {
      return Promise.resolve()
    }
    if (!debtTrackingEnabled) {
      setTerminology(DEBT_TERMINOLOGY_DEFAULTS)
      setLoading(false)
      return Promise.resolve()
    }
    return debtsApi
      .getTerminology(token)
      .then(setTerminology)
      .catch(() => setTerminology(DEBT_TERMINOLOGY_DEFAULTS))
      .finally(() => setLoading(false))
  }, [token, debtTrackingEnabled, modulesLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ ...terminology, loading, refresh }), [terminology, loading, refresh])

  return <DebtTerminologyContext.Provider value={value}>{children}</DebtTerminologyContext.Provider>
}

// Returns { debt_term_module, debt_term_debt, debt_term_payment, loading, refresh }.
export function useDebtTerminology() {
  const ctx = useContext(DebtTerminologyContext)
  if (!ctx) {
    throw new Error('useDebtTerminology must be used within a DebtTerminologyProvider')
  }
  return ctx
}
