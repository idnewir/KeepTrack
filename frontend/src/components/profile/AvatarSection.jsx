import { useEffect, useRef, useState } from 'react'
import { authApi, profileApi } from '../../utils/api.js'
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

  const [urlValue, setUrlValue] = useState(user.avatar_url || '')
  const [savingUrl, setSavingUrl] = useState(false)
  const [urlError, setUrlError] = useState('')

  // Keeps the URL field in sync when avatar_url changes from outside this
  // component's own save/clear actions below — most notably, uploading a
  // picture (the Upload image tab) clears avatar_url server-side, and
  // without this the URL field would keep showing whatever was last typed
  // here even though it no longer reflects the saved state. Only resyncs
  // when the saved value actually changes, so it doesn't clobber the field
  // while the user is still typing an unsaved edit.
  useEffect(() => {
    setUrlValue(user.avatar_url || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.avatar_url])

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

  const saveAvatarUrl = async (nextUrl) => {
    setUrlError('')
    setSavingUrl(true)
    try {
      await authApi.updateProfile(
        { display_name: user.display_name, email: user.email, avatar_url: nextUrl || '' },
        token
      )
      await afterChange()
    } catch (err) {
      setUrlError(err.message || 'Failed to save avatar URL')
    } finally {
      setSavingUrl(false)
    }
  }

  const handleClearUrl = () => {
    setUrlValue('')
    saveAvatarUrl('')
  }

  return (
    <div className="kt-profile-card kt-avatar-card">
      <div className="kt-avatar-current">
        <Avatar userId={user.id} token={token} size={80} title={user.display_name || user.username} />
        <p className="kt-field-note">
          {user.has_avatar
            ? 'Uploaded picture'
            : user.avatar_url
              ? 'External image'
              : 'Generated from your initials — upload a picture or set a URL below.'}
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
          aria-selected={tab === 'url'}
          className={`kt-users-tab${tab === 'url' ? ' active' : ''}`}
          onClick={() => setTab('url')}
        >
          Avatar URL
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
          <div className="kt-field">
            <label htmlFor="avatar-url">Image URL</label>
            <input
              id="avatar-url"
              type="url"
              placeholder="https://…"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
            />
            <span className="kt-field-note">
              You can use Gravatar, DiceBear, or any direct image URL. Links:{' '}
              <a href="https://www.dicebear.com" target="_blank" rel="noreferrer">DiceBear</a>
              {' · '}
              <a href="https://www.gravatar.com" target="_blank" rel="noreferrer">Gravatar</a>
            </span>
          </div>

          {urlValue.trim() && (
            <div className="kt-avatar-url-preview">
              <img
                src={urlValue.trim()}
                alt="Preview"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden'
                }}
                onLoad={(e) => {
                  e.currentTarget.style.visibility = 'visible'
                }}
              />
            </div>
          )}

          {urlError && <div className="kt-auth-error">{urlError}</div>}

          <div className="kt-avatar-tab-actions">
            <button
              type="button"
              className="kt-auth-button"
              disabled={savingUrl || !urlValue.trim()}
              onClick={() => saveAvatarUrl(urlValue.trim())}
            >
              {savingUrl ? 'Saving…' : 'Save'}
            </button>
            {user.avatar_url && (
              <button type="button" className="kt-category-link-button kt-category-danger" onClick={handleClearUrl} disabled={savingUrl}>
                Clear URL
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
