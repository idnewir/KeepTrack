import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import PagePlaceholder from './pages/PagePlaceholder.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
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
    </Routes>
  )
}
