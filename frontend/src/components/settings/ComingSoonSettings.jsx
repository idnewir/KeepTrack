export default function ComingSoonSettings({ title, description }) {
  return (
    <div>
      <h2 className="kt-panel-title">{title}</h2>
      {description && <p className="kt-panel-subtitle">{description}</p>}
      <div className="kt-settings-coming-soon">Coming soon.</div>
    </div>
  )
}
