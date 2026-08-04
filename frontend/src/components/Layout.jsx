import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="kt-app">
      <Header onMenuClick={() => setSidebarOpen((v) => !v)} />
      <div className="kt-body">
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        <main className="kt-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
