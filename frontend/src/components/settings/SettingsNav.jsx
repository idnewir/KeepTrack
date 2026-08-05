export const SETTINGS_CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'terminology', label: 'Terminology' },
  { key: 'signing', label: 'Signing & Export' },
  { key: 'ai', label: 'AI & Extraction' },
  { key: 'storage', label: 'Storage & Backup' },
  { key: 'users', label: 'Users', badge: 'Admin' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'logs', label: 'Logs', badge: 'Admin' },
  { key: 'danger', label: 'Danger Zone', danger: true },
]

export default function SettingsNav({ active, onSelect }) {
  return (
    <nav className="kt-settings-nav" aria-label="Settings categories">
      <ul className="kt-settings-nav-list">
        {SETTINGS_CATEGORIES.map((cat) => (
          <li key={cat.key}>
            <button
              type="button"
              className={`kt-settings-nav-link${active === cat.key ? ' active' : ''}${cat.danger ? ' danger' : ''}`}
              onClick={() => onSelect(cat.key)}
            >
              <span>{cat.label}</span>
              {cat.badge && <span className="kt-settings-nav-badge">{cat.badge}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
