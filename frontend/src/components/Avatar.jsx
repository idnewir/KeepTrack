import { useEffect, useState } from 'react'
import { profileApi } from '../utils/api.js'

// GET /profile/avatar/{id} always returns *something* — the uploaded
// picture, a redirect to the external URL, or a generated initials image —
// so there's no client-side fallback to render, just a loading placeholder.
// Object URLs are cached per user for the lifetime of the tab rather than
// re-fetched every time a component using the same user's avatar mounts
// (e.g. the header on every route change).
const cache = new Map() // userId -> Promise<string | null>

// invalidateAvatarCache() drops a stale cache entry after the current user
// changes their own avatar, but every already-mounted <Avatar> for that
// user (e.g. the header AND the profile page's own avatar, both mounted at
// once) needs to actually re-fetch, not just the next component that
// happens to mount — its props (userId/token) haven't changed, so nothing
// would otherwise tell an existing instance's effect to re-run. This tiny
// event target is how invalidation reaches instances already on screen,
// so the header updates immediately after a save with no page reload. See
// docs/decisions-log.md.
const updateEvents = new EventTarget()

export function invalidateAvatarCache(userId) {
  cache.delete(userId)
  updateEvents.dispatchEvent(new CustomEvent('update', { detail: { userId } }))
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
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    const onUpdate = (e) => {
      if (e.detail.userId === userId) setRefreshTick((t) => t + 1)
    }
    updateEvents.addEventListener('update', onUpdate)
    return () => updateEvents.removeEventListener('update', onUpdate)
  }, [userId])

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
  }, [userId, token, refreshTick])

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
