import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './hooks/AuthContext.jsx'
import { TerminologyProvider } from './context/TerminologyContext.jsx'
import { DebtTerminologyProvider } from './context/DebtTerminologyContext.jsx'
import { BudgetTerminologyProvider } from './context/BudgetTerminologyContext.jsx'
import { SiteNameProvider } from './context/SiteNameContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { ModulesProvider } from './context/ModulesContext.jsx'
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
import './styles/pagination.css'
import './styles/logs.css'
import './styles/imports.css'
import './styles/welcome.css'
import './styles/help.css'
import './styles/search.css'
import './styles/notifications.css'
import './styles/debts.css'
import './styles/budget.css'
import './styles/tooltip.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ModulesProvider>
            <TerminologyProvider>
              <DebtTerminologyProvider>
                <BudgetTerminologyProvider>
                  <SiteNameProvider>
                    <App />
                  </SiteNameProvider>
                </BudgetTerminologyProvider>
              </DebtTerminologyProvider>
            </TerminologyProvider>
          </ModulesProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
