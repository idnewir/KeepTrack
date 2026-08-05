import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { authApi } from '../utils/api.js'

export default function ChangePasswordPage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    try {
      await authApi.forcePasswordChange({ new_password: newPassword }, user.token)
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Your password was reset by an Administrator. Set a new password to continue."
    >
      <form className="kt-auth-form" onSubmit={handleSubmit}>
        {error && <div className="kt-auth-error">{error}</div>}

        <div className="kt-field">
          <label htmlFor="change-new-password">New password</label>
          <input
            id="change-new-password"
            type="password"
            required
            minLength={8}
            autoFocus
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <span className="kt-field-note">At least 8 characters.</span>
        </div>

        <div className="kt-field">
          <label htmlFor="change-confirm-password">Confirm new password</label>
          <input
            id="change-confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <button className="kt-auth-button" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <p className="kt-auth-footer">
        <button type="button" className="kt-link-button" onClick={logout}>
          Log out
        </button>
      </p>
    </AuthCard>
  )
}
