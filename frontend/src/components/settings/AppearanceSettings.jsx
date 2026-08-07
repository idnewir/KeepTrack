import TerminologySettings from './TerminologySettings.jsx'
import DebtTerminologySettings from './DebtTerminologySettings.jsx'
import { useModules } from '../../context/ModulesContext.jsx'

export default function AppearanceSettings({ token }) {
  const { isEnabled } = useModules()

  return (
    <div>
      <h2 className="kt-panel-title">Appearance</h2>
      <p className="kt-panel-subtitle">Customise how Keep Track looks and reads.</p>

      <div className="kt-settings-info-box">
        Dark mode is controlled per-user via the toggle in the header.
      </div>

      <TerminologySettings token={token} />

      {isEnabled('debt_tracking') && <DebtTerminologySettings token={token} />}
    </div>
  )
}
