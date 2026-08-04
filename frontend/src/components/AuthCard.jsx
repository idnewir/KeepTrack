import Logo from './Logo.jsx'

export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="kt-auth-screen">
      <div className="kt-auth-card">
        <div className="kt-auth-brand">
          <Logo size={28} />
          <span className="kt-auth-wordmark">
            <span style={{ color: 'var(--kt-primary)' }}>Keep</span>{' '}
            <span style={{ color: 'var(--kt-text)' }}>Track</span>
          </span>
        </div>
        {title && <h1 className="kt-auth-title">{title}</h1>}
        {subtitle && <p className="kt-auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
