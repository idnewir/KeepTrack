import { useEffect, useState } from 'react'
import { settingsApi } from '../utils/api.js'

// The raw 'YYYY-MM-DD' value of the app_start_date setting, or null if unset.
// Shared by every page that needs to hide months before it (backend/services
// /date_service.py does the equivalent for endpoints that filter server-side).
export function useAppStartDate(token) {
  const [appStartDate, setAppStartDate] = useState(null)

  useEffect(() => {
    let cancelled = false
    settingsApi
      .list(token)
      .then((rows) => {
        if (cancelled) return
        const row = rows.find((r) => r.key === 'app_start_date')
        setAppStartDate(row?.value || null)
      })
      .catch(() => {
        if (!cancelled) setAppStartDate(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return appStartDate
}

// True if (year, month) falls on or after app_start_date — or, when unset,
// always true (matches the backend's "no setting means show everything").
export function isMonthVisible(year, month, appStartDate) {
  if (!appStartDate) return true
  const start = new Date(`${appStartDate}T00:00:00`)
  const startKey = start.getFullYear() * 12 + start.getMonth()
  return year * 12 + (month - 1) >= startKey
}
