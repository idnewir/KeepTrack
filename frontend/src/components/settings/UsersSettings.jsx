import { useState } from 'react'
import ActiveUsersTab from './ActiveUsersTab.jsx'
import PendingApprovalTab from './PendingApprovalTab.jsx'

const TABS = [
  { key: 'active', label: 'Active users' },
  { key: 'pending', label: 'Pending approval' },
]

export default function UsersSettings({ token }) {
  const [tab, setTab] = useState('active')

  return (
    <div>
      <h2 className="kt-panel-title">Users & Access</h2>

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

      {tab === 'active' ? <ActiveUsersTab token={token} /> : <PendingApprovalTab token={token} />}
    </div>
  )
}
