import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { budgetsApi } from '../utils/api.js'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useModules } from './ModulesContext.jsx'

// Matches backend/services/budget_service.py's BUDGET_TERMINOLOGY_DEFAULTS.
export const BUDGET_TERMINOLOGY_DEFAULTS = {
  budget_term_module: 'Budget Planning',
  budget_term_budget: 'Budget',
  budget_term_savings_goal: 'Savings Goal',
}

const BudgetTerminologyContext = createContext(null)

export function BudgetTerminologyProvider({ children }) {
  const { user } = useAuth()
  const token = user?.token
  const { isEnabled } = useModules()
  const budgetPlanningEnabled = isEnabled('budget_planning')

  const [terminology, setTerminology] = useState(BUDGET_TERMINOLOGY_DEFAULTS)
  const [loading, setLoading] = useState(true)

  // GET /budgets/terminology is gated behind the budget_planning module
  // (like every other /budgets endpoint) — skipped entirely while the
  // module is off so disabled deployments never see a 403 in the console,
  // same reasoning as DebtTerminologyContext.
  const refresh = useCallback(() => {
    if (!token || !budgetPlanningEnabled) {
      setTerminology(BUDGET_TERMINOLOGY_DEFAULTS)
      setLoading(false)
      return Promise.resolve()
    }
    return budgetsApi
      .getTerminology(token)
      .then(setTerminology)
      .catch(() => setTerminology(BUDGET_TERMINOLOGY_DEFAULTS))
      .finally(() => setLoading(false))
  }, [token, budgetPlanningEnabled])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ ...terminology, loading, refresh }), [terminology, loading, refresh])

  return <BudgetTerminologyContext.Provider value={value}>{children}</BudgetTerminologyContext.Provider>
}

// Returns { budget_term_module, budget_term_budget, budget_term_savings_goal, loading, refresh }.
export function useBudgetTerminology() {
  const ctx = useContext(BudgetTerminologyContext)
  if (!ctx) {
    throw new Error('useBudgetTerminology must be used within a BudgetTerminologyProvider')
  }
  return ctx
}
