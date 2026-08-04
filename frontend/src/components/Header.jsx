import Logo from './Logo.jsx'

export default function Header({ onMenuClick }) {
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

      <div className="kt-brand">
        <Logo size={28} />
        <span className="kt-wordmark">
          <span style={{ color: 'var(--kt-primary)' }}>Keep</span>{' '}
          <span style={{ color: 'var(--kt-text)' }}>Track</span>
        </span>
      </div>
    </header>
  )
}
