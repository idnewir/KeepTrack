import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'

export function LoadingScreen() {
  return <div className="kt-auth-loading">Loading…</div>
}

// Protects the main app shell: requires a logged-in user with a valid token.
export function RequireAuth({ children }) {
  const { user, loading, setupRequired } = useAuth()

  if (loading) return <LoadingScreen />
  if (setupRequired) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace />

  return children
}

// For Login/Register: only unauthenticated users, and only once setup exists.
export function RequireGuest({ children }) {
  const { user, loading, setupRequired } = useAuth()

  if (loading) return <LoadingScreen />
  if (setupRequired) return <Navigate to="/setup" replace />
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

// Catch-all: send unmatched paths wherever the user should currently be.
export function DefaultRedirect() {
  const { user, loading, setupRequired } = useAuth()

  if (loading) return <LoadingScreen />
  if (setupRequired) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace />

  return <Navigate to="/" replace />
}
