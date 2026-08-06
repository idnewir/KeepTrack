import SigningExportSettings from './SigningExportSettings.jsx'

export default function SecuritySettings({ token }) {
  return (
    <div>
      <h2 className="kt-panel-title">Security</h2>
      <p className="kt-panel-subtitle">Signing, session, and multi-factor authentication controls.</p>

      <SigningExportSettings token={token} />

      <div className="kt-settings-list" style={{ marginTop: 32 }}>
        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">Session timeout</span>
            <p className="kt-settings-row-description">
              Automatically sign users out after a period of inactivity.
            </p>
          </div>
          <span className="kt-settings-row-status">Coming soon</span>
        </div>

        <div className="kt-settings-row">
          <div className="kt-settings-row-text">
            <span className="kt-settings-row-title">MFA settings</span>
            <p className="kt-settings-row-description">
              Manage multi-factor authentication requirements for your team.
            </p>
          </div>
          <span className="kt-settings-row-status">Coming soon</span>
        </div>
      </div>
    </div>
  )
}
