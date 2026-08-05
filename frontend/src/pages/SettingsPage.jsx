import { useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import SettingsNav from '../components/settings/SettingsNav.jsx'
import GeneralSettings from '../components/settings/GeneralSettings.jsx'
import TerminologySettings from '../components/settings/TerminologySettings.jsx'
import SigningExportSettings from '../components/settings/SigningExportSettings.jsx'
import UsersSettings from '../components/settings/UsersSettings.jsx'
import ComingSoonSettings from '../components/settings/ComingSoonSettings.jsx'
import DangerZoneSettings from '../components/settings/DangerZoneSettings.jsx'

export default function SettingsPage() {
  const { user } = useAuth()
  const token = user?.token

  const [activeCategory, setActiveCategory] = useState('general')
  const [mobileShowContent, setMobileShowContent] = useState(false)

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
              {activeCategory === 'ai' && (
                <ComingSoonSettings
                  title="AI & Extraction"
                  description="Configure how invoices are read and categorised automatically."
                />
              )}
              {activeCategory === 'storage' && (
                <ComingSoonSettings
                  title="Storage & Backup"
                  description="Manage where invoice files and backups are kept."
                />
              )}
              {activeCategory === 'users' && <UsersSettings token={token} />}
              {activeCategory === 'notifications' && (
                <ComingSoonSettings
                  title="Notifications"
                  description="Choose which alerts you and your team receive, and when."
                />
              )}
              {activeCategory === 'danger' && <DangerZoneSettings />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
