import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import Logo from './Logo.jsx'

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
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
        </span>
      </Link>

      {user && (
        <div className="kt-header-user">
          <span className="kt-header-username">{user.username}</span>
          <button className="kt-header-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </header>
  )
}
