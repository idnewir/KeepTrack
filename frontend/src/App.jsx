import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import {
  DefaultRedirect,
  RequireAdmin,
  RequireAuth,
  RequireGuest,
  RequireSetupNeeded,
} from './components/RouteGuards.jsx'
import CategoriesPage from './pages/CategoriesPage.jsx'
import ContributionsPage from './pages/ContributionsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ForecastBreakdownPage from './pages/ForecastBreakdownPage.jsx'
import InvoiceDetailPage from './pages/InvoiceDetailPage.jsx'
import InvoicesPage from './pages/InvoicesPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MFAPage from './pages/MFAPage.jsx'
import PagePlaceholder from './pages/PagePlaceholder.jsx'
import PendingApprovalPage from './pages/PendingApprovalPage.jsx'
import ReconciliationPage from './pages/ReconciliationPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import SetupPage from './pages/SetupPage.jsx'
import UploadPage from './pages/UploadPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route
        path="/setup"
        element={
          <RequireSetupNeeded>
            <SetupPage />
          </RequireSetupNeeded>
        }
      />
      <Route
        path="/login"
        element={
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        }
      />
      <Route
        path="/register"
        element={
          <RequireGuest>
            <RegisterPage />
          </RequireGuest>
        }
      />
      <Route path="/mfa" element={<MFAPage />} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/forecast" element={<ForecastBreakdownPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/contributions" element={<ContributionsPage />} />
        <Route path="/reconciliation" element={<ReconciliationPage />} />
        <Route
          path="/projects"
          element={
            <PagePlaceholder
              title="Projects"
              subtitle="Log and track planned projects."
            />
          }
        />
        <Route
          path="/reports"
          element={
            <PagePlaceholder
              title="Reports"
              subtitle="Generate and export financial reports."
            />
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/settings/categories"
          element={
            <RequireAdmin>
              <CategoriesPage />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  )
}
