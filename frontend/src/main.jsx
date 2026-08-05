import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './hooks/AuthContext.jsx'
import { TerminologyProvider } from './context/TerminologyContext.jsx'
import { SiteNameProvider } from './context/SiteNameContext.jsx'
import './styles/theme.css'
import './styles/layout.css'
import './styles/auth.css'
import './styles/categories.css'
import './styles/invoices.css'
import './styles/settings.css'
import './styles/dashboard.css'
import './styles/contributions.css'
import './styles/projects.css'
import './styles/reports.css'
import './styles/signing.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TerminologyProvider>
          <SiteNameProvider>
            <App />
          </SiteNameProvider>
        </TerminologyProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
