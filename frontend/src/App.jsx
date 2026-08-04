import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { DefaultRedirect, RequireAuth, RequireGuest, RequireSetupNeeded } from './components/RouteGuards.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MFAPage from './pages/MFAPage.jsx'
import PagePlaceholder from './pages/PagePlaceholder.jsx'
import PendingApprovalPage from './pages/PendingApprovalPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import SetupPage from './pages/SetupPage.jsx'

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
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/invoices"
          element={
            <PagePlaceholder
              title="Invoices"
              subtitle="Upload, review, sign, and manage invoices."
            />
          }
        />
        <Route
          path="/contributions"
          element={
            <PagePlaceholder
              title="Contributions"
              subtitle="Record monthly contributions by group."
            />
          }
        />
        <Route
          path="/reconciliation"
          element={
            <PagePlaceholder
              title="Reconciliation"
              subtitle="Compare calculated balance against actual bank balance."
            />
          }
        />
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
            <PagePlaceholder
              title="Settings"
              subtitle="Configure categories, users, and system options."
            />
          }
        />
      </Route>

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  )
}
