import { useState } from 'react'
import AuditLogTab from './AuditLogTab.jsx'
import ErrorLogTab from './ErrorLogTab.jsx'

const TABS = [
  { key: 'audit', label: 'Audit log' },
  { key: 'errors', label: 'Error log' },
]

export default function LogsSettings({ token, initialTab }) {
  const [tab, setTab] = useState(initialTab === 'errors' ? 'errors' : 'audit')

  return (
    <div>
      <h2 className="kt-panel-title">Logs</h2>

      <div className="kt-logs-info-box">
        Keep Track automatically manages your logs to keep the app fast and your data clean. Audit
        logs are archived every 90 days — archived entries are kept permanently and can be exported
        at any time. Error logs are automatically deleted after 90 days. These settings cannot be
        changed to ensure data integrity.
      </div>

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

      {tab === 'audit' ? <AuditLogTab token={token} /> : <ErrorLogTab token={token} />}
    </div>
  )
}
