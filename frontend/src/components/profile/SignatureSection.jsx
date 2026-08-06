import { useEffect, useRef, useState } from 'react'
import { profileApi } from '../../utils/api.js'

const MAX_SIGNATURE_MB = 2
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function isAcceptedImage(file) {
  return ACCEPTED_TYPES.includes(file.type)
}

export default function SignatureSection({ user, token, onChanged }) {
  const fileInputRef = useRef(null)

  const [savedUrl, setSavedUrl] = useState(null)
  const [loadingSaved, setLoadingSaved] = useState(false)

  const [dragging, setDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    if (!user.has_signature) {
      setSavedUrl(null)
      return undefined
    }
    let cancelled = false
    setLoadingSaved(true)
    profileApi
      .getSignatureBlob(user.id, token)
      .then((blob) => {
        if (!cancelled) setSavedUrl(URL.createObjectURL(blob))
      })
      .catch(() => {
        if (!cancelled) setSavedUrl(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.has_signature, user.id, token])

  const pickFile = (file) => {
    setUploadError('')
    if (!file) return
    if (!isAcceptedImage(file)) {
      setUploadError('Please choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_SIGNATURE_MB * 1024 * 1024) {
      setUploadError(`Image is too large (max ${MAX_SIGNATURE_MB} MB).`)
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
      await profileApi.uploadSignature(pendingFile, token)
      setPendingFile(null)
      setPreviewUrl(null)
      await onChanged?.()
    } catch (err) {
      setUploadError(err.message || 'Failed to upload signature')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    setUploadError('')
    setRemoving(true)
    try {
      await profileApi.removeSignature(token)
      await onChanged?.()
    } catch (err) {
      setUploadError(err.message || 'Failed to remove signature')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="kt-profile-card kt-signature-card">
      <div className="kt-signature-current">
        {user.has_signature ? (
          <div className="kt-signature-preview-frame">
            {loadingSaved ? (
              <span className="kt-field-note">Loading…</span>
            ) : savedUrl ? (
              <img src={savedUrl} alt="Your saved signature" />
            ) : (
              <span className="kt-field-note">Could not load your signature.</span>
            )}
          </div>
        ) : (
          <p className="kt-field-note">
            No saved signature — you will draw your signature each time you sign a document.
          </p>
        )}
      </div>

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
          <div className="kt-signature-preview-frame">
            <img src={previewUrl} alt="Preview" />
          </div>
        ) : (
          <>
            <p className="kt-dropzone-title">Drag and drop a signature image here</p>
            <p className="kt-dropzone-subtitle">JPG, PNG, or WebP — max {MAX_SIGNATURE_MB} MB</p>
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

      <p className="kt-field-note">
        For best results, sign on white paper and photograph or scan it. The background will be
        made transparent automatically.
      </p>

      {uploadError && <div className="kt-auth-error">{uploadError}</div>}

      <div className="kt-avatar-tab-actions">
        <button type="button" className="kt-auth-button" disabled={!pendingFile || uploading} onClick={handleUpload}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {user.has_signature && (
          <button
            type="button"
            className="kt-category-link-button kt-category-danger"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? 'Removing…' : 'Remove signature'}
          </button>
        )}
      </div>

      <p className="kt-field-note">
        Your saved signature will be used automatically when signing invoices. You can still draw
        a signature manually if preferred.
      </p>
    </div>
  )
}
