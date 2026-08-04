export default function Dashboard() {
  return (
    <div>
      <h1 className="kt-page-title">Dashboard</h1>
      <p className="kt-page-subtitle">
        Your financial overview will appear here — income vs. expenses vs.
        forecast, reserve status, and recent activity.
      </p>
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
        Dashboard widgets are coming soon.
      </div>
    </div>
  )
}
