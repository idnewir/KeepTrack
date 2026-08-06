import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '../utils/api.js'

const TOKEN_KEY = 'kt_access_token'
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [tempToken, setTempToken] = useState(null)
  const [setupRequired, setSetupRequired] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function bootstrap() {
      try {
        const status = await authApi.setupStatus()
        setSetupRequired(status.setup_required)
      } catch {
        setSetupRequired(false)
      }

      const savedToken = localStorage.getItem(TOKEN_KEY)
      if (savedToken) {
        try {
          const me = await authApi.me(savedToken)
          setUser({ ...me, token: savedToken })
        } catch {
          localStorage.removeItem(TOKEN_KEY)
        }
      }

      setLoading(false)
    }
    bootstrap()
  }, [])

  const finishLogin = async (accessToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken)
    const me = await authApi.me(accessToken)
    setUser({ ...me, token: accessToken })
    setTempToken(null)
    return me
  }

  // Password step. The backend decides whether MFA is required (false only
  // for the Superadmin break-glass account, based on its stored role) — the
  // frontend just follows whatever `mfa_required` says.
  const login = async (username, password) => {
    const data = await authApi.login({ username, password })
    if (!data.mfa_required) {
      await finishLogin(data.access_token)
      return { mfaRequired: false }
    }
    setTempToken(data.temp_token)
    return { mfaRequired: true }
  }

  const verifyMfa = async (code) => {
    if (!tempToken) {
      throw new Error('Login session expired — please sign in again.')
    }
    const data = await authApi.verifyMfa({ temp_token: tempToken, code })
    return finishLogin(data.access_token)
  }

  const register = (username, email, password) =>
    authApi.register({ username, email, password })

  const completeSetup = async (username, email, password) => {
    // Deliberately does NOT flip setupRequired yet — SetupPage still has the
    // QR-code and confirmation steps to show, and /setup's route guard would
    // otherwise redirect away the instant setupRequired becomes false.
    // markSetupComplete() below is called once the wizard is actually done.
    return authApi.setup({ username, email, password })
  }

  const markSetupComplete = () => setSetupRequired(false)

  // Re-fetches /auth/me and updates the stored user — used after the
  // profile page changes display_name/email so the header picks it up
  // immediately, without requiring a re-login.
  const refreshUser = async () => {
    if (!user?.token) return
    const me = await authApi.me(user.token)
    setUser({ ...me, token: user.token })
  }

  // Used after a password change: the backend invalidates every token
  // issued before the change (including the one this session was using),
  // so it hands back a fresh one for the session that just proved it knows
  // the new password. Without swapping it in here, the very next API call
  // from this tab would fail with "session invalidated". See
  // docs/decisions-log.md.
  const applyPasswordChange = ({ user: freshUser, access_token }) => {
    localStorage.setItem(TOKEN_KEY, access_token)
    setUser({ ...freshUser, token: access_token })
  }

  const logout = () => {
    // Best-effort audit hook — JWTs are stateless, so logging out is really
    // just discarding the local token; the request just records the event
    // and is never allowed to block or fail the actual client-side logout.
    if (user?.token) {
      authApi.logout(user.token).catch(() => {})
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setTempToken(null)
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      setupRequired,
      hasPendingMfa: Boolean(tempToken),
      login,
      verifyMfa,
      register,
      completeSetup,
      markSetupComplete,
      refreshUser,
      applyPasswordChange,
      logout,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, setupRequired, tempToken]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
