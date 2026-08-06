import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header.jsx'
import SessionTimeoutWarning from './SessionTimeoutWarning.jsx'
import Sidebar from './Sidebar.jsx'
import WelcomeOverlay from './WelcomeOverlay.jsx'
import { useSessionTimeout } from '../hooks/useSessionTimeout.js'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { secondsRemaining, stayLoggedIn } = useSessionTimeout()

  return (
    <div className="kt-app">
      <Header onMenuClick={() => setSidebarOpen((v) => !v)} />
      <div className="kt-body">
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        <main className="kt-main">
          <Outlet />
        </main>
      </div>
      <WelcomeOverlay />
      <SessionTimeoutWarning secondsRemaining={secondsRemaining} onStayLoggedIn={stayLoggedIn} />
    </div>
  )
}
