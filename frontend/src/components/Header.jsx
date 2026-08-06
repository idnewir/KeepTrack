import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useSiteName } from '../context/SiteNameContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import Avatar from './Avatar.jsx'
import Logo from './Logo.jsx'

const THEME_LABELS = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System preference',
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2Z"
      />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M8.5 20.5h7M12 16.5v4" />
    </svg>
  )
}

function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()
  const icon = theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <SystemIcon />

  return (
    <button
      type="button"
      className="kt-theme-toggle"
      onClick={cycleTheme}
      title={THEME_LABELS[theme]}
      aria-label={`Theme: ${THEME_LABELS[theme]}. Click to change.`}
    >
      {icon}
    </button>
  )
}

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const { siteName } = useSiteName()
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
        <span className="kt-brand-logo-group">
          <Logo size={28} />
          <span className="kt-wordmark">
            <span className="kt-wordmark-keep">Keep</span>{' '}
            <span className="kt-wordmark-track">Track</span>
          </span>
        </span>
        {showSiteName && (
          <span className="kt-brand-instance">
            <span className="kt-brand-divider" aria-hidden="true" />
            <span className="kt-instance-name">{siteName}</span>
          </span>
        )}
      </Link>

      {user && (
        <div className="kt-header-user" ref={menuRef}>
          <ThemeToggle />
          <button
            type="button"
            className="kt-header-profile-button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Avatar userId={user.id} token={user.token} size={32} title={user.display_name || user.username} />
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
