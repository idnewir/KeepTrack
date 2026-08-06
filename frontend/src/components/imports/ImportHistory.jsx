import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { importsApi } from '../../utils/api.js'
import { formatDateTime } from '../../utils/format.js'
import Modal from '../Modal.jsx'

export default function ImportHistory({ token, isAdmin, refreshKey }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // { batch, deleted_count, protected_count } once a dry-run check has come back
  const [confirming, setConfirming] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    importsApi
      .list(token)
      .then(setBatches)
      .catch((err) => setError(err.message || 'Failed to load import history'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [token, isAdmin, refreshKey])

  // GET /imports is Admin-only (see routers/imports.py) — Standard users can
  // import data but don't get a history list of everyone else's imports.
  if (!isAdmin) return null

  const handleDeleteClick = async (batch) => {
    setError('')
    setBusyId(batch.batch_id)
    try {
      const dryRun = await importsApi.deleteBatch(batch.batch_id, token, true)
      setConfirming({ batch, ...dryRun })
    } catch (err) {
      setError(err.message || 'Failed to check this batch')
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirming) return
    setBusyId(confirming.batch.batch_id)
    try {
      await importsApi.deleteBatch(confirming.batch.batch_id, token, false)
      setConfirming(null)
      load()
    } catch (err) {
      setError(err.message || 'Failed to delete this batch')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="kt-import-history">
      <h2 className="kt-import-history-title">Import history</h2>

      {error && <div className="kt-auth-error">{error}</div>}

      {loading ? (
        <p className="kt-page-subtitle">Loading…</p>
      ) : batches.length === 0 ? (
        <div className="kt-categories-empty">No imports yet.</div>
      ) : (
        <div className="kt-import-preview-scroll">
          <table className="kt-invoices-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>File</th>
                <th>Imported</th>
                <th>Status</th>
                <th>Imported by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.batch_id}>
                  <td>{formatDateTime(batch.imported_at)}</td>
                  <td>{batch.import_type === 'csv' ? 'CSV' : 'PDF'}</td>
                  <td>
                    {batch.filename || `${batch.total_records} file${batch.total_records === 1 ? '' : 's'}`}
                  </td>
                  <td>
                    {batch.imported_records} / {batch.total_records}
                  </td>
                  <td>
                    <span className={`kt-status-badge kt-import-batch-status-${batch.status}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td>{batch.imported_by_username || '—'}</td>
                  <td className="kt-import-history-actions">
                    <Link to={`/invoices?import_batch=${batch.batch_id}`} className="kt-category-link-button">
                      View invoices
                    </Link>
                    <button
                      type="button"
                      className="kt-category-link-button kt-category-danger"
                      onClick={() => handleDeleteClick(batch)}
                      disabled={busyId === batch.batch_id}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming && (
        <Modal title="Delete import batch?" onClose={() => setConfirming(null)}>
          <p>
            This will permanently delete <strong>{confirming.deleted_count}</strong> invoice
            {confirming.deleted_count === 1 ? '' : 's'} from this batch.
            {confirming.protected_count > 0 && (
              <>
                {' '}
                <strong>{confirming.protected_count}</strong> invoice{confirming.protected_count === 1 ? '' : 's'}{' '}
                will be kept because {confirming.protected_count === 1 ? 'it has' : 'they have'} been edited
                since import.
              </>
            )}
          </p>
          <div className="kt-modal-actions">
            <button type="button" className="kt-category-link-button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="kt-auth-button"
              style={{ width: 'auto', marginTop: 0, padding: '9px 18px' }}
              onClick={handleConfirmDelete}
              disabled={busyId === confirming.batch.batch_id}
            >
              {busyId === confirming.batch.batch_id ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
