import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.75.4-1.2.85-1.2 1.8v.3"
      />
      <circle cx="12" cy="16.9" r="0.15" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export default function Sidebar({ open, onNavigate }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const terminology = useTerminology()

  const navItems = [
    { label: 'Dashboard', to: '/' },
    { label: terminology.term_expenses, to: '/invoices' },
    { label: terminology.term_income, to: '/contributions' },
    { label: terminology.term_reconciliation, to: '/reconciliation' },
    { label: terminology.term_projects, to: '/projects' },
    { label: 'Reports', to: '/reports' },
  ]

  return (
    <>
      <nav className={`kt-sidebar${open ? ' open' : ''}`}>
        <ul className="kt-nav-list">
          {navItems.map((item) => (
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

        <div className="kt-nav-divider" role="separator" />

        <ul className="kt-nav-list">
          <li>
            <NavLink
              to="/help"
              onClick={onNavigate}
              className={({ isActive }) =>
                `kt-nav-link${isActive ? ' active' : ''}`
              }
            >
              <HelpIcon />
              Help
            </NavLink>
          </li>
          {isAdmin && (
            <li>
              <NavLink
                to="/settings"
                onClick={onNavigate}
                className={({ isActive }) =>
                  `kt-nav-link${isActive ? ' active' : ''}`
                }
              >
                Settings
              </NavLink>
            </li>
          )}
        </ul>
      </nav>
      <div
        className={`kt-sidebar-backdrop${open ? ' open' : ''}`}
        onClick={onNavigate}
      />
    </>
  )
}
