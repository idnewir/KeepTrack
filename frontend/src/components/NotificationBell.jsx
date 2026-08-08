import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { folderApi, notificationsApi } from '../utils/api.js'
import { formatNotificationTime } from '../utils/format.js'
import { InfoTooltip } from './Tooltip.jsx'
import { NOTIFICATION_TOOLTIPS } from '../utils/notificationTooltips.js'

const POLL_MS = 30000

// This app's Notification model has no per-notification "actions" concept —
// just a single `link`. Duplicate-detected notifications (see
// services/folder_watcher_service.py's _duplicate_notification_link) pack
// both the destination invoice (the link's path) and the original filename
// (a duplicate_filename query param) into that one URL so this component can
// render two buttons ("View existing invoice" / "Process anyway") from it
// instead of navigating on click. See docs/decisions-log.md.
function parseDuplicateLink(link) {
  try {
    const url = new URL(link || '', window.location.origin)
    return { filename: url.searchParams.get('duplicate_filename') }
  } catch {
    return { filename: null }
  }
}

function BellIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 16v-5a6 6 0 1 0-12 0v5l-1.6 2.4A1 1 0 0 0 5.2 20h13.6a1 1 0 0 0 .8-1.6L18 16Z"
      />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M10 22a2 2 0 0 0 4 0" />
    </svg>
  )
}

function SeverityIcon({ severity }) {
  if (severity === 'warning' || severity === 'critical') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3.5 22 20.5H2L12 3.5Z"
        />
        <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 10v4.5" />
        <circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 11v5.5" />
      <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Header notification bell + dropdown panel — polls GET /notifications/count
// every 30s for the badge, and only fetches the full list when the panel is
// actually opened. A brief shake plays when the unread count rises between
// polls (a new notification arrived), giving a lightweight "real-time" feel
// without an actual push channel. See docs/decisions-log.md.
export default function NotificationBell() {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const wrapRef = useRef(null)
  const knownCountRef = useRef(0)
  const [duplicateBusyId, setDuplicateBusyId] = useState(null)
  const [duplicateErrors, setDuplicateErrors] = useState({})

  const fetchCount = useCallback(() => {
    if (!token) return
    notificationsApi
      .count(token)
      .then((data) => {
        if (data.unread_count > knownCountRef.current) {
          setShake(true)
          setTimeout(() => setShake(false), 650)
        }
        knownCountRef.current = data.unread_count
        setUnreadCount(data.unread_count)
      })
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token) return undefined
    fetchCount()
    const interval = setInterval(fetchCount, POLL_MS)
    return () => clearInterval(interval)
  }, [token, fetchCount])

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    notificationsApi
      .list({ dismissed: 'false' }, token)
      .then((data) => {
        setNotifications(data.notifications)
        knownCountRef.current = data.unread_count
        setUnreadCount(data.unread_count)
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false))
  }, [open, token])

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleNotificationClick = async (notification) => {
    setOpen(false)
    if (!notification.read) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)))
      knownCountRef.current = Math.max(0, knownCountRef.current - 1)
      setUnreadCount(knownCountRef.current)
      notificationsApi.markRead(notification.id, token).catch(() => {})
    }
    if (notification.link) navigate(notification.link)
  }

  const handleDismiss = (e, notification) => {
    e.stopPropagation()
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
    if (!notification.read) {
      knownCountRef.current = Math.max(0, knownCountRef.current - 1)
      setUnreadCount(knownCountRef.current)
    }
    notificationsApi.dismiss(notification.id, token).catch(() => {})
  }

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    knownCountRef.current = 0
    setUnreadCount(0)
    notificationsApi.markAllRead(token).catch(() => {})
  }

  const handleProcessAnyway = async (e, notification) => {
    e.stopPropagation()
    const { filename } = parseDuplicateLink(notification.link)
    if (!filename) return
    setDuplicateBusyId(notification.id)
    setDuplicateErrors((prev) => ({ ...prev, [notification.id]: '' }))
    try {
      await folderApi.overrideDuplicate(filename, token)
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
      if (!notification.read) {
        knownCountRef.current = Math.max(0, knownCountRef.current - 1)
        setUnreadCount(knownCountRef.current)
      }
      notificationsApi.dismiss(notification.id, token).catch(() => {})
    } catch (err) {
      setDuplicateErrors((prev) => ({ ...prev, [notification.id]: err.message || 'Failed to process this file' }))
    } finally {
      setDuplicateBusyId(null)
    }
  }

  const handleDismissAll = () => {
    setNotifications([])
    knownCountRef.current = 0
    setUnreadCount(0)
    notificationsApi.dismissAll(token).catch(() => {})
  }

  if (!user) return null

  return (
    <div className="kt-notification-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`kt-notification-bell${shake ? ' kt-notification-bell-shake' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="kt-notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="kt-notification-panel" role="dialog" aria-label="Notifications">
          <div className="kt-notification-panel-header">
            <span className="kt-notification-panel-title">Notifications</span>
            {notifications.some((n) => !n.read) && (
              <button type="button" className="kt-notification-panel-action" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className="kt-notification-list">
            {loading ? (
              <div className="kt-notification-empty">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="kt-notification-empty">
                <strong>No notifications</strong>
                <p>You are all caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`kt-notification-row${n.read ? '' : ' kt-notification-row-unread'}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <span className={`kt-notification-icon kt-notification-icon-${n.severity}`}>
                    <SeverityIcon severity={n.severity} />
                  </span>
                  <span className="kt-notification-row-body">
                    <span className={`kt-notification-row-title${n.read ? '' : ' kt-notification-row-title-unread'}`}>
                      {n.title}
                      {NOTIFICATION_TOOLTIPS[n.type] && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <InfoTooltip content={NOTIFICATION_TOOLTIPS[n.type]} label={`What does "${n.title}" mean?`} />
                        </span>
                      )}
                    </span>
                    <span className="kt-notification-row-message">{n.message}</span>
                    <span className="kt-notification-row-time">{formatNotificationTime(n.created_at)}</span>
                    {n.type === 'folder_duplicate_detected' && (
                      <span style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="kt-notification-panel-action"
                          onClick={() => handleNotificationClick(n)}
                        >
                          View existing
                        </button>
                        <button
                          type="button"
                          className="kt-notification-panel-action"
                          onClick={(e) => handleProcessAnyway(e, n)}
                          disabled={duplicateBusyId === n.id}
                        >
                          {duplicateBusyId === n.id ? 'Processing…' : 'Process anyway'}
                        </button>
                        {duplicateErrors[n.id] && (
                          <span className="kt-auth-error" style={{ margin: 0, flexBasis: '100%' }}>
                            {duplicateErrors[n.id]}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="kt-notification-row-dismiss"
                    aria-label="Dismiss notification"
                    onClick={(e) => handleDismiss(e, n)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="kt-notification-panel-footer">
              <button type="button" className="kt-notification-panel-action" onClick={handleDismissAll}>
                Dismiss all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
