import { Link } from 'react-router-dom'
import ImportWorkspace from '../components/imports/ImportWorkspace.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function ImportPage() {
  const { user } = useAuth()
  const token = user?.token
  const canImport = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'standard'
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  if (!canImport) {
    return (
      <div>
        <h1 className="kt-page-title">Import</h1>
        <p className="kt-page-subtitle">
          Read-only accounts cannot import data. <Link to="/invoices">Back to invoices</Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="kt-page-title">Import</h1>
      <p className="kt-page-subtitle">
        Bring in historical invoice data from before you started using Keep Track — quickly, and
        without the normal review and signing workflow.
      </p>

      <ImportWorkspace token={token} isAdmin={isAdmin} />
    </div>
  )
}
