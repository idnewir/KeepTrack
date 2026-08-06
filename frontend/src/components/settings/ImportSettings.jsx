import ImportWorkspace from '../imports/ImportWorkspace.jsx'
import { useAuth } from '../../hooks/AuthContext.jsx'

export default function ImportSettings({ token }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <div>
      <h2 className="kt-panel-title">Import Data</h2>
      <p className="kt-panel-subtitle">
        Import historical invoice data from a CSV spreadsheet or bulk PDF upload. Imported
        invoices are marked as historical and do not require signing or review.
      </p>

      <ImportWorkspace token={token} isAdmin={isAdmin} />
    </div>
  )
}
