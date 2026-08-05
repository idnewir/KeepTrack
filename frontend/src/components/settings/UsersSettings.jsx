import { useEffect, useState } from 'react'
import { authApi } from '../../utils/api.js'

const ROLE_OPTIONS = [
  { value: 'standard', label: 'Standard user' },
  { value: 'admin', label: 'Admin' },
  { value: 'readonly', label: 'Read only' },
]

export default function UsersSettings({ token }) {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [roleChoice, setRoleChoice] = useState({})
  const [busyId, setBusyId] = useState(null)

  const loadPending = () => {
    setLoading(true)
    setError('')
    return authApi
      .pendingUsers(token)
      .then(setPending)
      .catch((err) => setError(err.message || 'Failed to load pending users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleApprove = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await authApi.approveUser(id, roleChoice[id] || 'standard', token)
      await loadPending()
    } catch (err) {
      setError(err.message || 'Failed to approve user')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <h2 className="kt-panel-title">Users</h2>
      <p className="kt-panel-subtitle">
        Approve new registrations and assign their role. Full account editing and deactivation
        is coming soon.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="kt-page-subtitle">Loading…</p>
      ) : pending.length === 0 ? (
        <div className="kt-settings-coming-soon">No users are waiting for approval.</div>
      ) : (
        <div className="kt-settings-list">
          {pending.map((u) => (
            <div className="kt-settings-row" key={u.id}>
              <div className="kt-settings-row-text">
                <span className="kt-settings-row-title">{u.username}</span>
                <p className="kt-settings-row-description">{u.email}</p>
              </div>
              <div className="kt-settings-row-control" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={roleChoice[u.id] || 'standard'}
                  onChange={(e) => setRoleChoice((r) => ({ ...r, [u.id]: e.target.value }))}
                  aria-label={`Role for ${u.username}`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => handleApprove(u.id)}
                  disabled={busyId === u.id}
                >
                  {busyId === u.id ? 'Approving…' : 'Approve'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
