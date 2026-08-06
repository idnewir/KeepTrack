import { useEffect, useRef, useState } from 'react'
import ReviewCard from '../ReviewCard.jsx'
import { aiApi, categoriesApi, importsApi, invoicesApi, projectsApi } from '../../utils/api.js'

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

const STATUS_LABELS = {
  waiting: 'Waiting',
  processing: 'Processing…',
  ready: 'Ready to review',
  confirmed: 'Confirmed',
  failed: 'Failed',
}

export default function PdfImportTab({ token, onImported }) {
  const [categories, setCategories] = useState([])
  const [projects, setProjects] = useState([])
  const [aiStatus, setAiStatus] = useState(null)

  const [dragging, setDragging] = useState(false)
  // Each entry: { file, status: 'waiting' | 'processing' | 'ready' | 'confirmed' | 'failed' }
  const [queue, setQueue] = useState([])
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState('')

  // Each entry: { invoice, file } — same shape UploadPage keeps, so
  // ReviewCard can be reused unmodified for its preview/edit logic.
  const [reviewItems, setReviewItems] = useState([])
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const fileInputRef = useRef(null)

  useEffect(() => {
    categoriesApi.list(token).then(setCategories).catch(() => setCategories([]))
    projectsApi.list(token).then(setProjects).catch(() => setProjects([]))
    aiApi.status(token).then(setAiStatus).catch(() => setAiStatus(null))
  }, [token])

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).filter(isPdf)
    setQueue((prev) => {
      const existingKeys = new Set(prev.map((q) => `${q.file.name}:${q.file.size}`))
      const deduped = incoming
        .filter((f) => !existingKeys.has(`${f.name}:${f.size}`))
        .map((file) => ({ file, status: 'waiting' }))
      return [...prev, ...deduped]
    })
  }

  const removeQueued = (index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleProcess = async () => {
    const waiting = queue.filter((q) => q.status === 'waiting')
    if (waiting.length === 0) return

    setProcessError('')
    setProcessing(true)
    setQueue((prev) => prev.map((q) => (q.status === 'waiting' ? { ...q, status: 'processing' } : q)))

    try {
      const invoices = await importsApi.uploadPdfs(waiting.map((q) => q.file), token)
      const byFilename = new Map(invoices.map((inv) => [inv.filename, inv]))

      setQueue((prev) =>
        prev.map((q) => {
          if (q.status !== 'processing') return q
          const invoice = byFilename.get(q.file.name)
          return invoice ? { ...q, status: 'ready', invoice } : { ...q, status: 'failed' }
        })
      )
      setReviewItems((prev) => [
        ...prev,
        ...waiting
          .map((q) => byFilename.get(q.file.name))
          .filter(Boolean)
          .map((invoice) => ({ invoice, file: waiting.find((q) => q.file.name === invoice.filename)?.file })),
      ])
      onImported?.()
    } catch (err) {
      setProcessError(err.message || 'Processing failed')
      setQueue((prev) => prev.map((q) => (q.status === 'processing' ? { ...q, status: 'failed' } : q)))
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmed = (confirmedInvoice) => {
    setReviewItems((prev) => prev.filter((item) => item.invoice.id !== confirmedInvoice.id))
    setQueue((prev) =>
      prev.map((q) => (q.invoice?.id === confirmedInvoice.id ? { ...q, status: 'confirmed' } : q))
    )
  }

  const handleDiscarded = (invoiceId) => {
    setReviewItems((prev) => prev.filter((item) => item.invoice.id !== invoiceId))
    setQueue((prev) => prev.filter((q) => q.invoice?.id !== invoiceId))
  }

  const handleBulkConfirm = async () => {
    setBulkError('')
    setBulkConfirming(true)
    for (const item of [...reviewItems]) {
      try {
        const confirmed = await invoicesApi.confirm(item.invoice.id, token)
        handleConfirmed(confirmed)
      } catch (err) {
        setBulkError(`Could not confirm '${item.invoice.filename}': ${err.message || 'unknown error'}`)
      }
    }
    setBulkConfirming(false)
  }

  const waitingCount = queue.filter((q) => q.status === 'waiting').length

  return (
    <div className="kt-import-tab">
      <p className="kt-page-subtitle">
        Import historical PDF invoices in bulk. AI will extract data from each PDF. Review each one
        before confirming. No signing required for historical imports.
      </p>

      <div
        className={`kt-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <p className="kt-dropzone-title">Drag and drop PDF invoices here</p>
        <p className="kt-dropzone-subtitle">or</p>
        <button
          type="button"
          className="kt-auth-button kt-dropzone-browse"
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
        >
          Browse files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="kt-pending-files">
          <ul className="kt-pending-files-list">
            {queue.map((q, i) => (
              <li key={`${q.file.name}:${q.file.size}:${i}`} className="kt-pending-file-row">
                <span className="kt-pending-file-name">{q.file.name}</span>
                <span className={`kt-status-badge kt-import-queue-status-${q.status}`}>
                  {STATUS_LABELS[q.status]}
                </span>
                {q.status === 'waiting' && (
                  <button type="button" className="kt-category-link-button kt-category-danger" onClick={() => removeQueued(i)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {processError && <div className="kt-auth-error">{processError}</div>}

          {waitingCount > 0 && (
            <button type="button" className="kt-auth-button" onClick={handleProcess} disabled={processing}>
              {processing ? 'Processing…' : `Process ${waitingCount} PDF${waitingCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      {reviewItems.length > 0 && (
        <div className="kt-import-review-section">
          <div className="kt-import-mapping-header">
            <h3>Review extracted invoices</h3>
            <button type="button" className="kt-auth-button" onClick={handleBulkConfirm} disabled={bulkConfirming}>
              {bulkConfirming ? 'Confirming…' : 'Confirm all reviewed'}
            </button>
          </div>
          {bulkError && <div className="kt-auth-error">{bulkError}</div>}

          <div className="kt-review-list">
            {reviewItems.map((item) => (
              <ReviewCard
                key={item.invoice.id}
                invoice={item.invoice}
                file={item.file}
                categories={categories}
                projects={projects}
                signingEnabled={false}
                aiStatus={aiStatus}
                historical
                onConfirm={handleConfirmed}
                onDiscard={handleDiscarded}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
