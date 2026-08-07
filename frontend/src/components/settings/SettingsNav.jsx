import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/AuthContext.jsx'
import { useModules } from '../../context/ModulesContext.jsx'

export const SETTINGS_CATEGORIES = [
  { key: 'general', label: 'General' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'security', label: 'Security' },
  { key: 'ai', label: 'AI & Extraction' },
  { key: 'users', label: 'Users & Access', badge: 'Admin' },
  // Key stays 'logs' (not e.g. 'notifications-logs') so existing dashboard
  // deep links — /settings?section=logs[&tab=errors], sent by
  // critical_errors_detected/audit_log_archived notifications — keep working
  // without a backend change.
  { key: 'logs', label: 'Notifications & Logs', badge: 'Admin' },
  {
    key: 'data',
    label: 'Data',
    group: true,
    items: [
      // moduleKey (not present on any other item here) — filtered out below
      // when its module is disabled, per the "Import link hidden when
      // bulk_import disabled" requirement. See docs/decisions-log.md.
      { key: 'import', label: 'Import Data', moduleKey: 'bulk_import' },
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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { isEnabled } = useModules()
  // Expanded by default only when a sub-item is already the active category
  // (e.g. arriving via ?section=storage) — collapsed otherwise.
  const [dataExpanded, setDataExpanded] = useState(() => DATA_GROUP_KEYS.includes(active))

  // A deep link can change `active` after mount (e.g. a dashboard
  // notification navigating straight to a Data sub-item) — make sure the
  // group is open so the newly active sub-item is actually visible.
  useEffect(() => {
    if (DATA_GROUP_KEYS.includes(active)) setDataExpanded(true)
  }, [active])

  // Standard and Read Only users can now reach Settings (so the Feature
  // Modules section under General is visible to them), but every other
  // category is still Admin-only — restrict the nav down to just General
  // for anyone else rather than adding a role check to every other
  // category's own component. See docs/decisions-log.md.
  const visibleCategories = isAdmin ? SETTINGS_CATEGORIES : SETTINGS_CATEGORIES.filter((cat) => cat.key === 'general')

  return (
    <nav className="kt-settings-nav" aria-label="Settings categories">
      <ul className="kt-settings-nav-list">
        {visibleCategories.map((cat) =>
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
                  {cat.items
                    .filter((item) => !item.moduleKey || isEnabled(item.moduleKey))
                    .map((item) => (
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
