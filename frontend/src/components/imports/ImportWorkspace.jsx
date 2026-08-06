import { useState } from 'react'
import CsvImportTab from './CsvImportTab.jsx'
import PdfImportTab from './PdfImportTab.jsx'
import ImportHistory from './ImportHistory.jsx'

// Shared by the standalone /import route (ImportPage) and the Settings ->
// Import Data panel (ImportSettings) so the tab/history state and behaviour
// stay in one place regardless of where it's rendered.
export default function ImportWorkspace({ token, isAdmin }) {
  const [tab, setTab] = useState('csv')
  // Bumped after any successful import so ImportHistory reloads without a
  // page refresh — it doesn't otherwise know an import elsewhere just happened.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const bumpHistory = () => setHistoryRefreshKey((k) => k + 1)

  return (
    <>
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
    </>
  )
}
