import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/AuthContext.jsx'
import { authApi } from '../../utils/api.js'
import { formatDate, formatRelativeTime } from '../../utils/format.js'
import Modal from '../Modal.jsx'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'standard', label: 'Standard user' },
  { value: 'readonly', label: 'Read only' },
]

const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  standard: 'Standard user',
  readonly: 'Read only',
}

export default function ActiveUsersTab({ token }) {
  const { user: me } = useAuth()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [confirmingDeactivateId, setConfirmingDeactivateId] = useState(null)

  // Reset-password modal state: { user, stage: 'confirm' | 'result', tempPassword }
  const [resetModal, setResetModal] = useState(null)
  const [resetError, setResetError] = useState('')
  const [copied, setCopied] = useState(false)

  const loadUsers = () => {
    setLoading(true)
    setError('')
    return authApi
      .listUsers(token)
      .then((data) => setUsers(data.filter((u) => u.approved)))
      .catch((err) => setError(err.message || 'Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const isLocked = (u) => u.id === me?.id || u.role === 'superadmin'

  const handleRoleChange = async (id, role) => {
    setError('')
    setBusyId(id)
    try {
      await authApi.updateUserRole(id, role, token)
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to change role')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeactivate = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await authApi.deactivateUser(id, token)
      setConfirmingDeactivateId(null)
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to deactivate user')
    } finally {
      setBusyId(null)
    }
  }

  const handleReactivate = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await authApi.reactivateUser(id, token)
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Failed to reactivate user')
    } finally {
      setBusyId(null)
    }
  }

  const openResetModal = (u) => {
    setResetError('')
    setCopied(false)
    setResetModal({ user: u, stage: 'confirm', tempPassword: '' })
  }

  const closeResetModal = () => setResetModal(null)

  const confirmReset = async () => {
    if (!resetModal) return
    setResetError('')
    setBusyId(resetModal.user.id)
    try {
      const result = await authApi.resetUserPassword(resetModal.user.id, token)
      setResetModal((m) => ({ ...m, stage: 'result', tempPassword: result.temporary_password }))
    } catch (err) {
      setResetError(err.message || 'Failed to reset password')
    } finally {
      setBusyId(null)
    }
  }

  const copyTempPassword = async () => {
    if (!resetModal?.tempPassword) return
    try {
      await navigator.clipboard.writeText(resetModal.tempPassword)
      setCopied(true)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the password is
      // still visible on screen to copy manually.
    }
  }

  if (loading) return <p className="kt-page-subtitle">Loading…</p>

  return (
    <div>
      <p className="kt-panel-subtitle">View and manage every approved user account.</p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="kt-settings-coming-soon">No active users yet.</div>
      ) : (
        <div className="kt-table-scroll">
          <table className="kt-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const locked = isLocked(u)
                return (
                  <tr key={u.id} className={u.is_active ? '' : 'kt-users-row-inactive'}>
                    <td>
                      <span className="kt-users-name">{u.display_name || u.username}</span>
                      <span className="kt-users-username">@{u.username}</span>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      {locked ? (
                        ROLE_LABELS[u.role] || u.role
                      ) : (
                        <select
                          className="kt-users-role-select"
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          disabled={busyId === u.id}
                          aria-label={`Role for ${u.username}`}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>{formatRelativeTime(u.last_login)}</td>
                    <td>
                      <span className={`kt-status-badge ${u.is_active ? 'kt-status-active' : 'kt-status-inactive'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="kt-users-actions">
                        {!locked && (
                          <>
                            <button
                              type="button"
                              className="kt-category-link-button"
                              onClick={() => openResetModal(u)}
                              disabled={busyId === u.id}
                            >
                              Reset password
                            </button>
                            {u.is_active ? (
                              confirmingDeactivateId === u.id ? (
                                <>
                                  <span className="kt-category-confirm-text">Deactivate?</span>
                                  <button
                                    type="button"
                                    className="kt-category-link-button kt-category-danger"
                                    onClick={() => handleDeactivate(u.id)}
                                    disabled={busyId === u.id}
                                  >
                                    {busyId === u.id ? 'Deactivating…' : 'Yes, deactivate'}
                                  </button>
                                  <button
                                    type="button"
                                    className="kt-category-link-button"
                                    onClick={() => setConfirmingDeactivateId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="kt-category-link-button kt-category-danger"
                                  onClick={() => setConfirmingDeactivateId(u.id)}
                                  disabled={busyId === u.id}
                                >
                                  Deactivate
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                className="kt-category-link-button"
                                onClick={() => handleReactivate(u.id)}
                                disabled={busyId === u.id}
                              >
                                {busyId === u.id ? 'Reactivating…' : 'Reactivate'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {resetModal && (
        <Modal
          title={resetModal.stage === 'confirm' ? 'Reset password' : 'Temporary password generated'}
          onClose={closeResetModal}
        >
          {resetError && <div className="kt-auth-error" style={{ marginBottom: 16 }}>{resetError}</div>}

          {resetModal.stage === 'confirm' ? (
            <>
              <p>
                Generate a new temporary password for{' '}
                <strong>{resetModal.user.display_name || resetModal.user.username}</strong>? Their current
                password will stop working immediately.
              </p>
              <div className="kt-modal-actions">
                <button type="button" className="kt-category-link-button" onClick={closeResetModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="kt-auth-button"
                  style={{ width: 'auto', marginTop: 0, padding: '9px 18px' }}
                  onClick={confirmReset}
                  disabled={busyId === resetModal.user.id}
                >
                  {busyId === resetModal.user.id ? 'Generating…' : 'Generate password'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Share this temporary password with the user. They will be asked to change it on next
                login.
              </p>
              <div className="kt-temp-password-box">
                <span>{resetModal.tempPassword}</span>
                <button type="button" className="kt-auth-button kt-temp-password-copy" onClick={copyTempPassword}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="kt-modal-actions">
                <button type="button" className="kt-auth-button" style={{ width: 'auto', marginTop: 0, padding: '9px 18px' }} onClick={closeResetModal}>
                  Done
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
