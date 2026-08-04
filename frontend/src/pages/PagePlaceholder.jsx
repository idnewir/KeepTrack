export default function PagePlaceholder({ title, subtitle }) {
  return (
    <div>
      <h1 className="kt-page-title">{title}</h1>
      <p className="kt-page-subtitle">{subtitle}</p>
      <div
        style={{
          border: '1px dashed var(--kt-border)',
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
          color: '#8a8a86',
          background: 'var(--kt-surface)',
        }}
      >
        This page is coming soon.
      </div>
    </div>
  )
}
