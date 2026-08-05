import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'

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
    { label: 'Settings', to: '/settings', adminOnly: true },
  ]

  return (
    <>
      <nav className={`kt-sidebar${open ? ' open' : ''}`}>
        <ul className="kt-nav-list">
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
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
