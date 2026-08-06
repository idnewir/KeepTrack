import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../utils/api.js'
import { useAuth } from './AuthContext.jsx'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
const WARNING_WINDOW_MS = 5 * 60 * 1000 // warn 5 minutes before timeout
const TICK_MS = 1000

// Inactivity-based session timeout: any mouse/keyboard/touch/scroll activity
// resets the timer, a warning modal appears 5 minutes before the configured
// timeout (session_timeout_minutes from GET /auth/me), and the timer pauses
// entirely while the tab is hidden (Page Visibility API) so switching tabs
// doesn't burn down the clock. See docs/decisions-log.md.
export function useSessionTimeout() {
  const { user, forceLogout } = useAuth()
  const navigate = useNavigate()
  const timeoutMinutes = user?.session_timeout_minutes

  const [secondsRemaining, setSecondsRemaining] = useState(null)
  const lastActivityRef = useRef(Date.now())
  const hiddenAtRef = useRef(null)
  // Mirrors "warning currently showing", read synchronously inside the
  // activity listener (state updates are async and would lag by a frame).
  const warningShowingRef = useRef(false)

  const performInactivityLogout = useCallback(async () => {
    const token = user?.token
    if (token) {
      // Only the inactivity path revokes this way — a manual logout already
      // revokes via POST /auth/logout's own header-based check. See
      // docs/decisions-log.md.
      try {
        await authApi.revokeMfaRemember(token)
      } catch {
        // Best effort — a failed revoke must not block the client-side logout.
      }
    }
    forceLogout()
    navigate('/login', { replace: true, state: { inactivityLogout: true } })
  }, [user, forceLogout, navigate])

  // The only way to dismiss the warning — background activity elsewhere on
  // the page does not, by design (see the hook effect below).
  const stayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now()
    warningShowingRef.current = false
    setSecondsRemaining(null)
  }, [])

  useEffect(() => {
    if (!user || !timeoutMinutes) return undefined // no user, or timeout set to "Never" (0)

    const timeoutMs = timeoutMinutes * 60 * 1000
    const warningAtMs = Math.max(timeoutMs - WARNING_WINDOW_MS, 0)

    lastActivityRef.current = Date.now()
    warningShowingRef.current = false
    setSecondsRemaining(null)

    const handleActivity = () => {
      // Once the warning is up, only the "Stay logged in" button (via
      // stayLoggedIn) resets the timer — the modal must not be dismissable
      // by clicking or typing anywhere else on the page. See
      // docs/decisions-log.md.
      if (warningShowingRef.current) return
      lastActivityRef.current = Date.now()
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }))

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
      } else if (hiddenAtRef.current !== null) {
        // Shift the last-activity instant forward by however long the tab
        // was hidden, so that time doesn't count against the user.
        lastActivityRef.current += Date.now() - hiddenAtRef.current
        hiddenAtRef.current = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const interval = setInterval(() => {
      if (document.hidden) return

      const elapsed = Date.now() - lastActivityRef.current
      if (elapsed >= timeoutMs) {
        warningShowingRef.current = false
        setSecondsRemaining(null)
        performInactivityLogout()
        return
      }
      if (elapsed >= warningAtMs) {
        warningShowingRef.current = true
        setSecondsRemaining(Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000)))
      } else if (warningShowingRef.current) {
        warningShowingRef.current = false
        setSecondsRemaining(null)
      }
    }, TICK_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity))
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(interval)
    }
  }, [user, timeoutMinutes, performInactivityLogout])

  return { secondsRemaining, warningOpen: secondsRemaining !== null, stayLoggedIn }
}
