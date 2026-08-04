import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/' },
  { label: 'Invoices', to: '/invoices' },
  { label: 'Contributions', to: '/contributions' },
  { label: 'Reconciliation', to: '/reconciliation' },
  { label: 'Projects', to: '/projects' },
  { label: 'Reports', to: '/reports' },
  {
    label: 'Settings',
    to: '/settings',
    children: [{ label: 'Categories', to: '/settings/categories', adminOnly: true }],
  },
]

export default function Sidebar({ open, onNavigate }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <>
      <nav className={`kt-sidebar${open ? ' open' : ''}`}>
        <ul className="kt-nav-list">
          {NAV_ITEMS.map((item) => {
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
