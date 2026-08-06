import { useEffect, useState } from 'react'

export const SETTINGS_CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'terminology', label: 'Terminology' },
  { key: 'signing', label: 'Signing & Export' },
  { key: 'ai', label: 'AI & Extraction' },
  { key: 'users', label: 'Users', badge: 'Admin' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'logs', label: 'Logs', badge: 'Admin' },
  {
    key: 'data',
    label: 'Data',
    group: true,
    items: [
      { key: 'import', label: 'Import Data' },
      { key: 'storage', label: 'Storage & Backup' },
      { key: 'system-reset', label: 'System Reset', danger: true },
    ],
  },
]

const DATA_GROUP_KEYS = SETTINGS_CATEGORIES.find((cat) => cat.group).items.map((item) => item.key)

function ChevronIcon({ expanded }) {
  return (
    <svg
      className={`kt-settings-nav-chevron${expanded ? ' expanded' : ''}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SettingsNav({ active, onSelect }) {
  // Expanded by default only when a sub-item is already the active category
  // (e.g. arriving via ?section=storage) — collapsed otherwise.
  const [dataExpanded, setDataExpanded] = useState(() => DATA_GROUP_KEYS.includes(active))

  // A deep link can change `active` after mount (e.g. a dashboard
  // notification navigating straight to a Data sub-item) — make sure the
  // group is open so the newly active sub-item is actually visible.
  useEffect(() => {
    if (DATA_GROUP_KEYS.includes(active)) setDataExpanded(true)
  }, [active])

  return (
    <nav className="kt-settings-nav" aria-label="Settings categories">
      <ul className="kt-settings-nav-list">
        {SETTINGS_CATEGORIES.map((cat) =>
          cat.group ? (
            <li key={cat.key}>
              <button
                type="button"
                className="kt-settings-nav-group-header"
                onClick={() => setDataExpanded((v) => !v)}
                aria-expanded={dataExpanded}
              >
                <span>{cat.label}</span>
                <ChevronIcon expanded={dataExpanded} />
              </button>
              {dataExpanded && (
                <ul className="kt-settings-nav-sublist">
                  {cat.items.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={`kt-settings-nav-link kt-settings-nav-sublink${active === item.key ? ' active' : ''}${item.danger ? ' danger' : ''}`}
                        onClick={() => onSelect(item.key)}
                      >
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ) : (
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
          )
        )}
      </ul>
    </nav>
  )
}
