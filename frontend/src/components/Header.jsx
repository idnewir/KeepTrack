import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import Logo from './Logo.jsx'

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const { site_name: siteName } = useTerminology()
  const navigate = useNavigate()
  const showSiteName = siteName && siteName !== 'Keep Track'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <header className="kt-header">
      <button
        className="kt-menu-button"
        onClick={onMenuClick}
        aria-label="Toggle navigation"
      >
        <span className="kt-menu-bar" />
        <span className="kt-menu-bar" />
        <span className="kt-menu-bar" />
      </button>

      <Link to="/" className="kt-brand" aria-label="Keep Track home">
        <Logo size={28} />
        <span className="kt-wordmark">
          <span style={{ color: 'var(--kt-primary)' }}>Keep</span>{' '}
          <span style={{ color: 'var(--kt-text)' }}>Track</span>
          {showSiteName && <span className="kt-wordmark-site"> — {siteName}</span>}
        </span>
      </Link>

      {user && (
        <div className="kt-header-user" ref={menuRef}>
          <button
            type="button"
            className="kt-header-profile-button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="kt-header-username">{user.display_name || user.username}</span>
            <span className={`kt-header-caret${menuOpen ? ' open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>

          {menuOpen && (
            <div className="kt-header-menu" role="menu">
              <Link
                to="/profile"
                role="menuitem"
                className="kt-header-menu-item"
                onClick={() => setMenuOpen(false)}
              >
                My profile
              </Link>
              <div className="kt-header-menu-divider" />
              <button type="button" role="menuitem" className="kt-header-menu-item" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
