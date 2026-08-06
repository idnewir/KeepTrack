import { useState } from 'react'
import LogsSettings from './LogsSettings.jsx'

const TABS = [
  { key: 'notifications', label: 'Notifications' },
  { key: 'logs', label: 'Logs' },
]

export default function NotificationsLogsSettings({ token, initialTab }) {
  // Notifications is still a placeholder, so Logs is the default tab
  // regardless of how this section was reached.
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
        <>
          <p className="kt-panel-subtitle">
            Choose which alerts you and your team receive, and when.
          </p>
          <div className="kt-settings-coming-soon">Coming soon.</div>
        </>
      ) : (
        <LogsSettings token={token} initialTab={initialTab} />
      )}
    </div>
  )
}
