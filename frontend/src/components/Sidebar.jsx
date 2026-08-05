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
    {
      label: 'Settings',
      to: '/settings',
      adminOnly: true,
      children: [{ label: 'Categories', to: '/settings/categories', adminOnly: true }],
    },
  ]

  return (
    <>
      <nav className={`kt-sidebar${open ? ' open' : ''}`}>
        <ul className="kt-nav-list">
          {navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const children = (item.children || []).filter((child) => !child.adminOnly || isAdmin)
            return (
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
                {children.length > 0 && (
                  <ul className="kt-nav-sublist">
                    {children.map((child) => (
                      <li key={child.to}>
                        <NavLink
                          to={child.to}
                          onClick={onNavigate}
                          className={({ isActive }) =>
                            `kt-nav-sublink${isActive ? ' active' : ''}`
                          }
                        >
                          {child.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      <div
        className={`kt-sidebar-backdrop${open ? ' open' : ''}`}
        onClick={onNavigate}
      />
    </>
  )
}
