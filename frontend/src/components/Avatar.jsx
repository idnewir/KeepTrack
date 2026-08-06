import { useEffect, useState } from 'react'
import { profileApi } from '../utils/api.js'

// GET /profile/avatar/{id} always returns *something* — the uploaded
// picture, a redirect to the external URL, or a generated initials image —
// so there's no client-side fallback to render, just a loading placeholder.
// Object URLs are cached per user for the lifetime of the tab rather than
// re-fetched every time a component using the same user's avatar mounts
// (e.g. the header on every route change). invalidateAvatarCache() drops a
// stale entry after the current user changes their own avatar.
const cache = new Map() // userId -> Promise<string | null>

export function invalidateAvatarCache(userId) {
  cache.delete(userId)
}

function loadAvatar(userId, token) {
  if (!cache.has(userId)) {
    cache.set(
      userId,
      profileApi
        .getAvatarBlob(userId, token)
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => null)
    )
  }
  return cache.get(userId)
}

export default function Avatar({ userId, token, size = 32, className = '', title }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!userId || !token) {
      setSrc(null)
      return undefined
    }
    let cancelled = false
    loadAvatar(userId, token).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [userId, token])

  return (
    <span
      className={`kt-avatar-img-wrap${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      title={title}
    >
      {src && <img src={src} alt={title || 'User avatar'} />}
    </span>
  )
}
