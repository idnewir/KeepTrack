import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/' },
  { label: 'Invoices', to: '/invoices' },
  { label: 'Contributions', to: '/contributions' },
  { label: 'Reconciliation', to: '/reconciliation' },
  { label: 'Projects', to: '/projects' },
  { label: 'Reports', to: '/reports' },
  { label: 'Settings', to: '/settings' },
]

export default function Sidebar({ open, onNavigate }) {
  return (
    <>
      <nav className={`kt-sidebar${open ? ' open' : ''}`}>
        <ul className="kt-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `kt-nav-link${isActive ? ' active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div
        className={`kt-sidebar-backdrop${open ? ' open' : ''}`}
        onClick={onNavigate}
      />
    </>
  )
}
