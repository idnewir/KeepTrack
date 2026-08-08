// Minimal reusable confirmation/detail modal — no dependency, matching this
// project's plain-CSS convention. Clicking the overlay or the close button
// dismisses it; content clicks are stopped from bubbling to the overlay.
export default function Modal({ title, onClose, children, className }) {
  return (
    <div className="kt-modal-overlay" onClick={onClose}>
      <div className={`kt-modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="kt-modal-header">
          {title && <h3 className="kt-modal-title">{title}</h3>}
          <button type="button" className="kt-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="kt-modal-body">{children}</div>
      </div>
    </div>
  )
}
