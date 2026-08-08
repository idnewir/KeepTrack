import { useState } from 'react'
import LogsSettings from './LogsSettings.jsx'
import NotificationSettings from './NotificationSettings.jsx'

const TABS = [
  { key: 'notifications', label: 'Notifications' },
  { key: 'logs', label: 'Logs' },
]

export default function NotificationsLogsSettings({ token, initialTab }) {
  // Logs is the default tab regardless of how this section was reached —
  // dashboard deep links (?section=logs&tab=errors) always target it, and
  // it's the more frequently used of the two day to day.
  const [tab, setTab] = useState('logs')

  return (
    <div>
      <h2 className="kt-panel-title">Notifications & Logs</h2>

      <div className="kt-users-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`kt-users-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'notifications' ? (
        <NotificationSettings token={token} />
      ) : (
        <LogsSettings token={token} initialTab={initialTab} />
      )}
    </div>
  )
}
