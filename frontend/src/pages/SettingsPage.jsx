import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import SettingsNav from '../components/settings/SettingsNav.jsx'
import GeneralSettings from '../components/settings/GeneralSettings.jsx'
import TerminologySettings from '../components/settings/TerminologySettings.jsx'
import SigningExportSettings from '../components/settings/SigningExportSettings.jsx'
import AISettings from '../components/settings/AISettings.jsx'
import UsersSettings from '../components/settings/UsersSettings.jsx'
import ComingSoonSettings from '../components/settings/ComingSoonSettings.jsx'
import StorageBackupSettings from '../components/settings/StorageBackupSettings.jsx'
import LogsSettings from '../components/settings/LogsSettings.jsx'
import DangerZoneSettings from '../components/settings/DangerZoneSettings.jsx'

export default function SettingsPage() {
  const { user } = useAuth()
  const token = user?.token

  // A dashboard notification (e.g. critical errors detected) can link
  // straight into a specific settings category — and, for Logs, a specific
  // sub-tab — via ?section=logs&tab=errors. Read once on mount, same as
  // every other page's initial-filter-from-URL pattern (see InvoicesPage).
  const [searchParams] = useSearchParams()
  const [activeCategory, setActiveCategory] = useState(searchParams.get('section') || 'general')
  const [mobileShowContent, setMobileShowContent] = useState(searchParams.get('section') != null)

  const handleSelectCategory = (key) => {
    setActiveCategory(key)
    setMobileShowContent(true)
  }

  const handleBack = () => setMobileShowContent(false)

  return (
    <div>
      <h1 className="kt-page-title">Settings</h1>
      <p className="kt-page-subtitle">Configure how Keep Track behaves for everyone.</p>

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
              {activeCategory === 'terminology' && <TerminologySettings token={token} />}
              {activeCategory === 'signing' && <SigningExportSettings token={token} />}
              {activeCategory === 'ai' && <AISettings token={token} />}
              {activeCategory === 'storage' && <StorageBackupSettings token={token} />}
              {activeCategory === 'users' && <UsersSettings token={token} />}
              {activeCategory === 'notifications' && (
                <ComingSoonSettings
                  title="Notifications"
                  description="Choose which alerts you and your team receive, and when."
                />
              )}
              {activeCategory === 'logs' && <LogsSettings token={token} initialTab={searchParams.get('tab')} />}
              {activeCategory === 'danger' && <DangerZoneSettings />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
