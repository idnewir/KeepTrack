import { useEffect, useRef, useState } from 'react'
import { profileApi } from '../../utils/api.js'
import { formatDate } from '../../utils/format.js'
import Avatar, { invalidateAvatarCache } from '../Avatar.jsx'

const MAX_AVATAR_MB = 5
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function isAcceptedImage(file) {
  return ACCEPTED_TYPES.includes(file.type)
}

export default function AvatarSection({ user, token, onChanged }) {
  const [tab, setTab] = useState('upload')
  const fileInputRef = useRef(null)

  const [dragging, setDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [removingAvatar, setRemovingAvatar] = useState(false)

  const [gravatarEmail, setGravatarEmail] = useState(user.email || '')
  const [fetchingGravatar, setFetchingGravatar] = useState(false)
  const [gravatarError, setGravatarError] = useState('')
  const [useDifferentEmail, setUseDifferentEmail] = useState(false)

  const isGravatarSourced = user.avatar_source === 'gravatar'

  // Keeps the email field in sync with the account's email when it changes
  // elsewhere (the account details form above), same reasoning as the old
  // avatar-URL field's resync: only the saved value changing should update
  // it, not every render, so it doesn't clobber an unsaved edit in progress.
  useEffect(() => {
    setGravatarEmail(user.email || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.email])

  const afterChange = async () => {
    invalidateAvatarCache(user.id)
    await onChanged?.()
  }

  const pickFile = (file) => {
    setUploadError('')
    if (!file) return
    if (!isAcceptedImage(file)) {
      setUploadError('Please choose a JPG, PNG, GIF, or WebP image.')
      return
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setUploadError(`Image is too large (max ${MAX_AVATAR_MB} MB).`)
      return
    }
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (!pendingFile) return
    setUploadError('')
    setUploading(true)
    try {
      await profileApi.uploadAvatar(pendingFile, token)
      setPendingFile(null)
      setPreviewUrl(null)
      await afterChange()
    } catch (err) {
      setUploadError(err.message || 'Failed to upload picture')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setUploadError('')
    setRemovingAvatar(true)
    try {
      await profileApi.removeAvatar(token)
      await afterChange()
    } catch (err) {
      setUploadError(err.message || 'Failed to remove picture')
    } finally {
      setRemovingAvatar(false)
    }
  }

  const handleFetchGravatar = async () => {
    if (!gravatarEmail.trim()) return
    setGravatarError('')
    setFetchingGravatar(true)
    try {
      await profileApi.fetchGravatar(gravatarEmail.trim(), token)
      setUseDifferentEmail(false)
      await afterChange()
    } catch (err) {
      setGravatarError(err.message || 'Failed to fetch Gravatar image')
    } finally {
      setFetchingGravatar(false)
    }
  }

  const handleRefreshGravatar = async () => {
    setGravatarError('')
    setFetchingGravatar(true)
    try {
      await profileApi.refreshGravatar(token)
      await afterChange()
    } catch (err) {
      setGravatarError(err.message || 'Failed to refresh Gravatar image')
    } finally {
      setFetchingGravatar(false)
    }
  }

  return (
    <div className="kt-profile-card kt-avatar-card">
      <div className="kt-avatar-current">
        <Avatar userId={user.id} token={token} size={80} title={user.display_name || user.username} />
        <p className="kt-field-note">
          {isGravatarSourced
            ? 'Gravatar picture'
            : user.has_avatar
              ? 'Uploaded picture'
              : user.avatar_url
                ? 'External image'
                : 'Generated from your initials — upload a picture or fetch one from Gravatar below.'}
        </p>
      </div>

      <div className="kt-users-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'upload'}
          className={`kt-users-tab${tab === 'upload' ? ' active' : ''}`}
          onClick={() => setTab('upload')}
        >
          Upload image
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gravatar'}
          className={`kt-users-tab${tab === 'gravatar' ? ' active' : ''}`}
          onClick={() => setTab('gravatar')}
        >
          Gravatar
        </button>
      </div>

      {tab === 'upload' ? (
        <div className="kt-avatar-tab-panel">
          <div
            className={`kt-dropzone kt-dropzone-compact${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="kt-avatar-preview-img" />
            ) : (
              <>
                <p className="kt-dropzone-title">Drag and drop an image here</p>
                <p className="kt-dropzone-subtitle">JPG, PNG, GIF, or WebP — max {MAX_AVATAR_MB} MB</p>
              </>
            )}
            <button
              type="button"
              className="kt-auth-button kt-dropzone-browse"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              Browse…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              hidden
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>

          {uploadError && <div className="kt-auth-error">{uploadError}</div>}

          <div className="kt-avatar-tab-actions">
            <button type="button" className="kt-auth-button" disabled={!pendingFile || uploading} onClick={handleUpload}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {user.has_avatar && (
              <button
                type="button"
                className="kt-category-link-button kt-category-danger"
                onClick={handleRemoveAvatar}
                disabled={removingAvatar}
              >
                {removingAvatar ? 'Removing…' : 'Remove current picture'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="kt-avatar-tab-panel">
          <p className="kt-field-note">
            Use your Gravatar profile picture. Gravatar is a free service that links a profile
            picture to your email address.
          </p>

          {isGravatarSourced && !useDifferentEmail ? (
            <>
              <p className="kt-field-note">
                Last fetched: {user.avatar_fetched_at ? formatDate(user.avatar_fetched_at) : 'Unknown'}
              </p>

              {gravatarError && <div className="kt-auth-error">{gravatarError}</div>}

              <div className="kt-avatar-tab-actions">
                <button
                  type="button"
                  className="kt-auth-button"
                  onClick={handleRefreshGravatar}
                  disabled={fetchingGravatar}
                >
                  {fetchingGravatar ? (
                    <>
                      <span className="kt-ai-test-spinner" /> Refreshing…
                    </>
                  ) : (
                    'Refresh from Gravatar'
                  )}
                </button>
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => setUseDifferentEmail(true)}
                  disabled={fetchingGravatar}
                >
                  Use a different email
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="kt-field">
                <label htmlFor="gravatar-email">Email address</label>
                <input
                  id="gravatar-email"
                  type="email"
                  placeholder="you@example.com"
                  value={gravatarEmail}
                  onChange={(e) => setGravatarEmail(e.target.value)}
                />
              </div>

              {gravatarError && <div className="kt-auth-error">{gravatarError}</div>}

              <div className="kt-avatar-tab-actions">
                <button
                  type="button"
                  className="kt-auth-button"
                  disabled={fetchingGravatar || !gravatarEmail.trim()}
                  onClick={handleFetchGravatar}
                >
                  {fetchingGravatar ? (
                    <>
                      <span className="kt-ai-test-spinner" /> Fetching…
                    </>
                  ) : (
                    'Fetch from Gravatar'
                  )}
                </button>
                {isGravatarSourced && (
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={() => setUseDifferentEmail(false)}
                    disabled={fetchingGravatar}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}

          <div className="kt-ai-banner kt-ai-banner-warning">
            Your Gravatar image is saved to Keep Track when you fetch it. If you update your
            Gravatar profile picture, click Refresh from Gravatar to update it here.
          </div>

          <p className="kt-field-note">
            Don't have a Gravatar?{' '}
            <a href="https://www.gravatar.com" target="_blank" rel="noreferrer">
              Set one up at gravatar.com
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
