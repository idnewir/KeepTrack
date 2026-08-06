import { useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { authApi } from '../utils/api.js'
import { clearMfaRememberToken, getMfaRememberExpiry } from '../utils/mfaRemember.js'
import Avatar from '../components/Avatar.jsx'
import AvatarSection from '../components/profile/AvatarSection.jsx'
import SignatureSection from '../components/profile/SignatureSection.jsx'

const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  standard: 'Standard user',
  readonly: 'Read only',
}

function formatMemberSince(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatSessionTimeout(minutes) {
  if (!minutes) return 'Never'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const parts = []
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (mins) parts.push(`${mins} minute${mins === 1 ? '' : 's'}`)
  return parts.join(' ') || '0 minutes'
}

export default function ProfilePage() {
  const { user, refreshUser, applyPasswordChange } = useAuth()
  const token = user?.token

  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const [revokingMfaRemember, setRevokingMfaRemember] = useState(false)
  const [mfaRememberError, setMfaRememberError] = useState('')

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setSavingProfile(true)
    try {
      await authApi.updateProfile({ display_name: displayName.trim() || null, email: email.trim() }, token)
      await refreshUser()
      setProfileSuccess('Profile updated.')
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }

    setSavingPassword(true)
    try {
      const result = await authApi.changePassword(
        { current_password: currentPassword, new_password: newPassword }, token
      )
      applyPasswordChange(result)
      setPasswordSuccess('Password changed.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleRevokeMfaRemember = async () => {
    setMfaRememberError('')
    setRevokingMfaRemember(true)
    try {
      await authApi.revokeMfaRemember(token)
      clearMfaRememberToken()
      await refreshUser()
    } catch (err) {
      setMfaRememberError(err.message || 'Failed to revoke remembered MFA session')
    } finally {
      setRevokingMfaRemember(false)
    }
  }

  if (!user) return null

  return (
    <div>
      <h1 className="kt-page-title">My profile</h1>
      <p className="kt-page-subtitle">Manage your account details and password.</p>

      <div className="kt-profile-header">
        <Avatar userId={user.id} token={token} size={56} title={user.display_name || user.username} />
        <div>
          <span className="kt-profile-header-name">{user.display_name || user.username}</span>
          <span className="kt-profile-header-role">{ROLE_LABELS[user.role] || user.role}</span>
        </div>
      </div>

      <h2 className="kt-panel-title">Profile picture</h2>
      <AvatarSection user={user} token={token} onChanged={refreshUser} />

      <h2 className="kt-panel-title">Signature</h2>
      <SignatureSection user={user} token={token} onChanged={refreshUser} />

      <h2 className="kt-panel-title">Profile details</h2>
      <div className="kt-profile-card">
        {profileError && <div className="kt-auth-error" style={{ marginBottom: 16 }}>{profileError}</div>}
        {profileSuccess && <div className="kt-profile-success" style={{ marginBottom: 16 }}>{profileSuccess}</div>}
        <form className="kt-profile-form" onSubmit={handleSaveProfile}>
          <div className="kt-field">
            <label htmlFor="profile-display-name">Display name</label>
            <input
              id="profile-display-name"
              type="text"
              maxLength={150}
              placeholder={user.username}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="kt-field">
            <label htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="kt-auth-button" style={{ alignSelf: 'flex-start' }} disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>

      <h2 className="kt-panel-title">Change password</h2>
      <div className="kt-profile-card">
        {passwordError && <div className="kt-auth-error" style={{ marginBottom: 16 }}>{passwordError}</div>}
        {passwordSuccess && <div className="kt-profile-success" style={{ marginBottom: 16 }}>{passwordSuccess}</div>}
        <form className="kt-profile-form" onSubmit={handleChangePassword}>
          <div className="kt-field">
            <label htmlFor="profile-current-password">Current password</label>
            <input
              id="profile-current-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="kt-field">
            <label htmlFor="profile-new-password">New password</label>
            <input
              id="profile-new-password"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <span className="kt-field-note">At least 8 characters.</span>
          </div>
          <div className="kt-field">
            <label htmlFor="profile-confirm-password">Confirm new password</label>
            <input
              id="profile-confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="kt-auth-button" style={{ alignSelf: 'flex-start' }} disabled={savingPassword}>
            {savingPassword ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>

      <h2 className="kt-panel-title">Session security</h2>
      <div className="kt-settings-list">
        {mfaRememberError && <div className="kt-auth-error" style={{ margin: '12px 16px 0' }}>{mfaRememberError}</div>}
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Session timeout</span>
          </div>
          <span className="kt-settings-row-status">{formatSessionTimeout(user.session_timeout_minutes)}</span>
        </div>
        {user.role !== 'superadmin' && (
          <div className="kt-settings-row">
            <div className="kt-settings-row-text">
              <span className="kt-settings-row-title">MFA remember status</span>
              <p className="kt-settings-row-description">
                {user.mfa_remember_active
                  ? getMfaRememberExpiry()
                    ? `MFA verification remembered — expires ${formatDateTime(getMfaRememberExpiry())}`
                    : 'MFA verification remembered on this account.'
                  : 'MFA required on next login.'}
              </p>
            </div>
            {user.mfa_remember_active && (
              <button
                type="button"
                className="kt-category-link-button kt-category-danger"
                onClick={handleRevokeMfaRemember}
                disabled={revokingMfaRemember}
              >
                {revokingMfaRemember ? 'Revoking…' : 'Revoke'}
              </button>
            )}
          </div>
        )}
        <p className="kt-settings-row-description" style={{ padding: '12px 16px' }}>
          Session timeout and MFA remember duration are configured by your Administrator in
          Settings → Security.
        </p>
      </div>

      <h2 className="kt-panel-title">Account info</h2>
      <div className="kt-settings-list">
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Username</span>
          </div>
          <span className="kt-settings-row-status">{user.username}</span>
        </div>
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Role</span>
          </div>
          <span className="kt-settings-row-status">{ROLE_LABELS[user.role] || user.role}</span>
        </div>
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Member since</span>
          </div>
          <span className="kt-settings-row-status">{formatMemberSince(user.created_at)}</span>
        </div>
      </div>
    </div>
  )
}
