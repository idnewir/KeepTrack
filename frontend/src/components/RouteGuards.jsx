import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'

export function LoadingScreen() {
  return <div className="kt-auth-loading">Loading…</div>
}

// Protects the main app shell: requires a logged-in user with a valid token.
// Note: does NOT redirect to /setup when setupRequired is true — Login is
// always the default landing page; Setup is only reached via its own banner
// button or a direct /setup visit (see RequireSetupNeeded below).
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />

  return children
}

// For Login/Register: only unauthenticated users. Rendered even when
// setupRequired is true — Login shows its own "no accounts exist yet"
// banner in that case rather than being redirected away from.
export function RequireGuest({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />

  return children
}

// For the first-run Setup wizard: only reachable while no Admin exists yet.
export function RequireSetupNeeded({ children }) {
  const { user, loading, setupRequired } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />
  if (setupRequired === false) return <Navigate to="/login" replace />

  return children
}

// For Admin-only pages (e.g. Categories): requires an Admin or Superadmin role.
export function RequireAdmin({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin' && user.role !== 'superadmin') return <Navigate to="/" replace />

  return children
}

// Catch-all: send unmatched paths wherever the user should currently be.
export function DefaultRedirect() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />

  return <Navigate to="/" replace />
}
