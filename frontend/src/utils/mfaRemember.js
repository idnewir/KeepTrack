// Client-side storage for the MFA "remember this session" token (raw value,
// returned exactly once by POST /auth/verify-mfa) — shared by AuthContext
// (sends it on login/logout), MFAPage (stores it after a remembered
// verification), ProfilePage, and useSessionTimeout (revokes it on
// inactivity logout). See docs/decisions-log.md.
const TOKEN_KEY = 'keeptrack-mfa-remember-token'
const EXPIRES_KEY = 'keeptrack-mfa-remember-expires'

export function storeMfaRememberToken(token, expiresAt) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRES_KEY, expiresAt)
}

export function clearMfaRememberToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

// The stored raw token, or null if there isn't one or it's past its stored
// expiry. This is only a client-side convenience check to avoid sending a
// token that's obviously stale — the backend re-checks expiry/revocation
// itself and is the actual source of truth.
export function getMfaRememberToken() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  const expiresAt = localStorage.getItem(EXPIRES_KEY)
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    clearMfaRememberToken()
    return null
  }
  return token
}

export function getMfaRememberExpiry() {
  return localStorage.getItem(EXPIRES_KEY)
}
