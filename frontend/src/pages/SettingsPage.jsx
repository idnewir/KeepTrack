import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import HelpIconLink from '../components/HelpIconLink.jsx'
import SettingsNav from '../components/settings/SettingsNav.jsx'
import GeneralSettings from '../components/settings/GeneralSettings.jsx'
import AppearanceSettings from '../components/settings/AppearanceSettings.jsx'
import SecuritySettings from '../components/settings/SecuritySettings.jsx'
import AISettings from '../components/settings/AISettings.jsx'
import UsersSettings from '../components/settings/UsersSettings.jsx'
import NotificationsLogsSettings from '../components/settings/NotificationsLogsSettings.jsx'
import StorageBackupSettings from '../components/settings/StorageBackupSettings.jsx'
import ImportSettings from '../components/settings/ImportSettings.jsx'
import SystemResetSettings from '../components/settings/SystemResetSettings.jsx'

export default function SettingsPage() {
  const { user } = useAuth()
  const token = user?.token
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  // A dashboard notification (e.g. critical errors detected) can link
  // straight into a specific settings category — and, for Logs, a specific
  // sub-tab — via ?section=logs&tab=errors. Read once on mount, same as
  // every other page's initial-filter-from-URL pattern (see InvoicesPage).
  // Non-admins are pinned to 'general' regardless of the URL — every other
  // category is Admin-only (see SettingsNav), and a deep link is the one way
  // a non-admin could otherwise land on one of them directly.
  const [searchParams] = useSearchParams()
  const [activeCategory, setActiveCategory] = useState(
    isAdmin ? searchParams.get('section') || 'general' : 'general'
  )
  const [mobileShowContent, setMobileShowContent] = useState(searchParams.get('section') != null)

  const handleSelectCategory = (key) => {
    if (!isAdmin && key !== 'general') return
    setActiveCategory(key)
    setMobileShowContent(true)
  }

  const handleBack = () => setMobileShowContent(false)

  return (
    <div>
      <div className="kt-page-header">
        <h1 className="kt-page-title">Settings</h1>
        <p className="kt-page-subtitle">Configure how Keep Track behaves for everyone.</p>
        <HelpIconLink topic="settings-guide" />
      </div>

      <div className={`kt-settings-shell${mobileShowContent ? ' show-content' : ''}`}>
        <div className="kt-settings-track">
          <div className="kt-settings-nav-panel">
            <SettingsNav active={activeCategory} onSelect={handleSelectCategory} />
          </div>
          <div className="kt-settings-content-panel">
            <button type="button" className="kt-settings-back" onClick={handleBack}>
              ← Back to Settings
            </button>
            <div className="kt-settings-content" key={activeCategory}>
              {activeCategory === 'general' && <GeneralSettings token={token} />}
              {activeCategory === 'appearance' && <AppearanceSettings token={token} />}
              {activeCategory === 'security' && <SecuritySettings token={token} />}
              {activeCategory === 'ai' && <AISettings token={token} />}
              {activeCategory === 'users' && <UsersSettings token={token} />}
              {activeCategory === 'logs' && (
                <NotificationsLogsSettings token={token} initialTab={searchParams.get('tab')} />
              )}
              {activeCategory === 'import' && <ImportSettings token={token} />}
              {activeCategory === 'storage' && <StorageBackupSettings token={token} />}
              {activeCategory === 'system-reset' && <SystemResetSettings />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
