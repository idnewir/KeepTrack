import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ReviewCard from '../components/ReviewCard.jsx'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import { aiApi, categoriesApi, invoicesApi, settingsApi } from '../utils/api.js'
import { singularize } from '../utils/format.js'

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export default function UploadPage() {
  const { user } = useAuth()
  const token = user?.token
  const canUpload = user?.role !== 'readonly'
  const { term_expenses: termExpenses } = useTerminology()
  const expensesLower = termExpenses.toLowerCase()
  const expenseSingular = singularize(termExpenses)
  const expenseSingularLower = expenseSingular.toLowerCase()

  const [categories, setCategories] = useState([])
  const [signingEnabled, setSigningEnabled] = useState(true)
  const [aiStatus, setAiStatus] = useState(null)
  const [pendingFiles, setPendingFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  // Each item is { invoice, file } — file is the client-side File object,
  // kept around purely so ReviewCard can render its own PDF preview locally
  // without a round trip back to the server.
  const [reviewItems, setReviewItems] = useState(null)

  const fileInputRef = useRef(null)

  useEffect(() => {
    categoriesApi.list(token).then(setCategories).catch(() => setCategories([]))
    settingsApi
      .list(token)
      .then((rows) => {
        const signing = rows.find((row) => row.key === 'signing_enabled')
        setSigningEnabled(signing ? signing.value === 'true' : true)
      })
      .catch(() => setSigningEnabled(true))
    aiApi
      .status(token)
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
  }, [token])

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).filter(isPdf)
    setPendingFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}:${f.size}`))
      const deduped = incoming.filter((f) => !existingKeys.has(`${f.name}:${f.size}`))
      return [...prev, ...deduped]
    })
  }

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return
    setUploadError('')
    setUploading(true)
    setProgress(0)
    try {
      const invoices = await invoicesApi.upload(pendingFiles, token, setProgress)
      setReviewItems(invoices.map((invoice, i) => ({ invoice, file: pendingFiles[i] })))
      setPendingFiles([])
    } catch (err) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleConfirmed = (confirmedInvoice) => {
    setReviewItems((prev) => prev.filter((item) => item.invoice.id !== confirmedInvoice.id))
  }

  const handleDiscarded = (invoiceId) => {
    setReviewItems((prev) => prev.filter((item) => item.invoice.id !== invoiceId))
  }

  if (!canUpload) {
    return (
      <div>
        <h1 className="kt-page-title">Upload {expenseSingularLower}</h1>
        <p className="kt-page-subtitle">
          Read-only accounts can browse {expensesLower} but cannot upload new ones.{' '}
          <Link to="/invoices">Back to {expensesLower}</Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="kt-page-title">Upload {expenseSingularLower}</h1>
      <p className="kt-page-subtitle">
        Drop one or more PDF {expensesLower} below. AI reads each one automatically —
        you'll get a chance to check and correct the details before anything is saved.
      </p>

      {reviewItems === null && (
        <>
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
            <p className="kt-dropzone-title">Drag and drop PDF {expensesLower} here</p>
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

          {pendingFiles.length > 0 && (
            <div className="kt-pending-files">
              <ul className="kt-pending-files-list">
                {pendingFiles.map((file, i) => (
                  <li key={`${file.name}:${file.size}:${i}`} className="kt-pending-file-row">
                    <span className="kt-pending-file-name">{file.name}</span>
                    {uploading ? (
                      <span className="kt-pending-file-progress">
                        {Math.round(progress * 100)}%
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="kt-category-link-button kt-category-danger"
                        onClick={() => removePendingFile(i)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {uploadError && <div className="kt-auth-error">{uploadError}</div>}

              <button
                type="button"
                className="kt-auth-button"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading
                  ? `Uploading ${pendingFiles.length} ${pendingFiles.length === 1 ? expenseSingularLower : expensesLower}…`
                  : `Upload ${pendingFiles.length} ${pendingFiles.length === 1 ? expenseSingularLower : expensesLower}`}
              </button>
            </div>
          )}
        </>
      )}

      {reviewItems !== null && (
        <div className="kt-review-list">
          {reviewItems.length === 0 ? (
            <div className="kt-categories-empty">
              All done — every uploaded {expenseSingularLower} has been confirmed or discarded.{' '}
              <Link to="/invoices">View {expensesLower}</Link>
            </div>
          ) : (
            reviewItems.map((item) => (
              <ReviewCard
                key={item.invoice.id}
                invoice={item.invoice}
                file={item.file}
                categories={categories}
                signingEnabled={signingEnabled}
                aiStatus={aiStatus}
                onConfirm={handleConfirmed}
                onDiscard={handleDiscarded}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
