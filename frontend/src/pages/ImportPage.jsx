import { useState } from 'react'
import { Link } from 'react-router-dom'
import CsvImportTab from '../components/imports/CsvImportTab.jsx'
import PdfImportTab from '../components/imports/PdfImportTab.jsx'
import ImportHistory from '../components/imports/ImportHistory.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'

export default function ImportPage() {
  const { user } = useAuth()
  const token = user?.token
  const canImport = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'standard'
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const [tab, setTab] = useState('csv')
  // Bumped after any successful import so ImportHistory reloads without a
  // page refresh — it doesn't otherwise know an import elsewhere just happened.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const bumpHistory = () => setHistoryRefreshKey((k) => k + 1)

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

      <div className="kt-import-tabs">
        <button
          type="button"
          className={`kt-import-tab-button${tab === 'csv' ? ' active' : ''}`}
          onClick={() => setTab('csv')}
        >
          CSV import
        </button>
        <button
          type="button"
          className={`kt-import-tab-button${tab === 'pdf' ? ' active' : ''}`}
          onClick={() => setTab('pdf')}
        >
          PDF import
        </button>
      </div>

      {tab === 'csv' ? (
        <CsvImportTab token={token} onImported={bumpHistory} />
      ) : (
        <PdfImportTab token={token} onImported={bumpHistory} />
      )}

      <ImportHistory token={token} isAdmin={isAdmin} refreshKey={historyRefreshKey} />
    </div>
  )
}
