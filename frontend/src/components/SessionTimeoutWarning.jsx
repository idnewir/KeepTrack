// Deliberately not built on the shared Modal component (components/Modal.jsx)
// — that one dismisses on an overlay click, and this warning must not be
// dismissable except via the "Stay logged in" button. See docs/decisions-log.md.
function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function SessionTimeoutWarning({ secondsRemaining, onStayLoggedIn }) {
  if (secondsRemaining === null) return null

  return (
    <div className="kt-modal-overlay">
      <div className="kt-modal" role="alertdialog" aria-modal="true" aria-labelledby="session-timeout-title">
        <div className="kt-modal-header">
          <h3 className="kt-modal-title" id="session-timeout-title">
            Session expiring soon
          </h3>
        </div>
        <div className="kt-modal-body">
          <p>
            Your session will expire in 5 minutes due to inactivity. Click anywhere or press a key
            to stay logged in.
          </p>
          <p className="kt-session-timeout-countdown">{formatCountdown(secondsRemaining)}</p>
          <div className="kt-modal-actions">
            <button type="button" className="kt-auth-button" onClick={onStayLoggedIn} autoFocus>
              Stay logged in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
