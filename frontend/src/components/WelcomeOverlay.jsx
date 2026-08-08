import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useSiteName } from '../context/SiteNameContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { singularize } from '../utils/format.js'
import Logo from './Logo.jsx'

// Matches the fade-out transition length in welcome.css, so the overlay
// finishes animating off-screen before it unmounts (and, for a quick-start
// card, before navigation swaps out the page behind it).
const CLOSE_ANIMATION_MS = 200

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5"
      />
    </svg>
  )
}

function IncomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M12 7.5v9M14.7 9.7c-.4-.7-1.3-1.2-2.5-1.2-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 1.9c1.6.2 2.8.7 2.8 2s-1.2 2-2.8 2c-1.2 0-2.1-.5-2.5-1.2"
      />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="12" width="4.5" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9.8" y="7" width="4.5" height="13.5" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16" y="3.5" width="4.5" height="17" rx="1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function ReportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z"
      />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M9 12h6M9 15.5h6" />
    </svg>
  )
}

// Shown once, as a dimming overlay over the (still-visible) dashboard, after
// a user's first successful login — see docs/decisions-log.md. Lives in
// Layout.jsx so it sits above every authenticated page.
export default function WelcomeOverlay() {
  const { user, dismissWelcome } = useAuth()
  const { siteName } = useSiteName()
  const terminology = useTerminology()
  const navigate = useNavigate()

  const shouldShow = Boolean(user) && !user.has_seen_welcome
  const [visible, setVisible] = useState(shouldShow)
  const [closing, setClosing] = useState(false)

  // Terminology/site name resolve asynchronously after login, so `shouldShow`
  // can flip from false (defaults) to true once the real user record loads.
  // Once dismissed, `visible` stays false for the rest of this mounted
  // session regardless of later prop changes.
  useEffect(() => {
    if (shouldShow) setVisible(true)
  }, [shouldShow])

  if (!visible) return null

  const showSiteName = siteName && siteName !== 'Keep Track'
  const expensesLower = terminology.term_expenses.toLowerCase()
  const incomeLower = terminology.term_income.toLowerCase()
  const expenseSingular = singularize(terminology.term_expenses).toLowerCase()

  const dismiss = (to) => {
    setClosing(true)
    dismissWelcome()
    window.setTimeout(() => {
      setVisible(false)
      if (to) navigate(to)
    }, CLOSE_ANIMATION_MS)
  }

  const quickStarts = [
    {
      key: 'upload',
      icon: <UploadIcon />,
      title: `Upload your first ${expenseSingular}`,
      description: `Add your first ${expenseSingular} to get started`,
      to: '/upload',
    },
    {
      key: 'income',
      icon: <IncomeIcon />,
      title: `Record ${incomeLower}`,
      description: `Log your ${incomeLower} to get started`,
      to: '/contributions',
    },
    {
      key: 'dashboard',
      icon: <DashboardIcon />,
      title: 'View your dashboard',
      description: 'See your financial position at a glance',
      to: '/',
    },
    {
      key: 'report',
      icon: <ReportIcon />,
      title: 'Run a report',
      description: 'Generate a summary of your finances',
      to: '/reports',
    },
  ]

  return (
    <div className={`kt-welcome-overlay${closing ? ' closing' : ''}`}>
      <div
        className="kt-welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kt-welcome-title"
      >
        <div className="kt-welcome-header">
          <span className="kt-welcome-logo-group">
            <Logo size={36} />
            <span className="kt-wordmark">
              <span className="kt-wordmark-keep">Keep</span>{' '}
              <span className="kt-wordmark-track">Track</span>
            </span>
          </span>
          <h2 id="kt-welcome-title" className="kt-welcome-title">
            {showSiteName ? `Welcome to Keep Track — ${siteName}` : 'Welcome to Keep Track'}
          </h2>
          <p className="kt-welcome-subtitle">Your financial management tool</p>
        </div>

        <div className="kt-welcome-body">
          <p className="kt-welcome-greeting">Hi {user.display_name || user.username},</p>
          <p className="kt-welcome-message">
            Keep Track helps you manage your {expensesLower}, record {incomeLower}, and stay on top
            of your finances — all in one place.
          </p>

          <div className="kt-welcome-quickstart-grid">
            {quickStarts.map((item) => (
              <button
                key={item.key}
                type="button"
                className="kt-welcome-quickstart-card"
                onClick={() => dismiss(item.to)}
              >
                <span className="kt-welcome-quickstart-icon">{item.icon}</span>
                <span className="kt-welcome-quickstart-text">
                  <span className="kt-welcome-quickstart-title">{item.title}</span>
                  <span className="kt-welcome-quickstart-desc">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="kt-welcome-footer">
          <p className="kt-welcome-help">Get help anytime from the Help section in the menu</p>
          <button type="button" className="kt-welcome-cta" onClick={() => dismiss()}>
            Get started
          </button>
          <button type="button" className="kt-welcome-dismiss-link" onClick={() => dismiss()}>
            Don&rsquo;t show this again
          </button>
        </div>
      </div>
    </div>
  )
}
