import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { useTerminology } from '../context/TerminologyContext.jsx'
import SigningPanel from '../components/SigningPanel.jsx'
import { categoriesApi, invoicesApi, settingsApi } from '../utils/api.js'
import { singularize } from '../utils/format.js'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const canEdit = user?.role !== 'readonly'
  const canDelete = user?.role === 'admin' || user?.role === 'superadmin'
  const { term_expenses: termExpenses } = useTerminology()
  const expensesLower = termExpenses.toLowerCase()
  const expenseSingular = singularize(termExpenses)
  const expenseSingularLower = expenseSingular.toLowerCase()

  const [invoice, setInvoice] = useState(null)
  const [categories, setCategories] = useState([])
  const [signingEnabled, setSigningEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloadingSigned, setDownloadingSigned] = useState(false)
  const [confirmingUnlink, setConfirmingUnlink] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const [invoiceDate, setInvoiceDate] = useState('')
  const [supplier, setSupplier] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')

  // Signing flow — loading the original PDF from the server (there's no
  // in-memory File object here, unlike the upload/review stage) then
  // handing it to the same SigningPanel used during review.
  const [signingStage, setSigningStage] = useState(false)
  const [signFile, setSignFile] = useState(null)
  const [loadingSignFile, setLoadingSignFile] = useState(false)

  useEffect(() => {
    categoriesApi.list(token).then(setCategories).catch(() => setCategories([]))
    settingsApi
      .list(token)
      .then((rows) => {
        const signing = rows.find((row) => row.key === 'signing_enabled')
        setSigningEnabled(signing ? signing.value === 'true' : true)
      })
      .catch(() => setSigningEnabled(true))
  }, [token])

  useEffect(() => {
    setLoading(true)
    setError('')
    invoicesApi
      .get(id, token)
      .then((data) => {
        setInvoice(data)
        setInvoiceDate(data.invoice_date)
        setSupplier(data.supplier)
        setAmount(String(data.amount))
        setCategoryId(data.category_id != null ? String(data.category_id) : '')
        setNotes(data.notes || '')
      })
      .catch((err) => setError(err.message || 'Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id, token])

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const updated = await invoicesApi.update(
        id,
        {
          invoice_date: invoiceDate,
          supplier: supplier.trim(),
          amount: Number(amount),
          category_id: categoryId ? Number(categoryId) : null,
          notes: notes.trim() || null,
        },
        token
      )
      setInvoice(updated)
    } catch (err) {
      setError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadSigned = async () => {
    setError('')
    setDownloadingSigned(true)
    try {
      const blob = await invoicesApi.downloadSignedPdf(invoice.id, token)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signed_${invoice.filename}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'Failed to download signed PDF')
    } finally {
      setDownloadingSigned(false)
    }
  }

  const handleOpenSigning = async () => {
    setError('')
    setLoadingSignFile(true)
    try {
      const blob = await invoicesApi.getOriginalPdf(invoice.id, token)
      setSignFile(blob)
      setSigningStage(true)
    } catch (err) {
      setError(err.message || 'Failed to load the PDF for signing')
    } finally {
      setLoadingSignFile(false)
    }
  }

  const handleBackFromSigning = () => {
    setSigningStage(false)
    setSignFile(null)
  }

  // The signing endpoint already wrote signed=true and a new
  // signed_pdf_path — re-fetch to pick that up rather than a separate
  // confirm step, since the invoice here is already reviewed/confirmed.
  const handleSigned = async () => {
    try {
      const updated = await invoicesApi.get(invoice.id, token)
      setInvoice(updated)
    } catch (err) {
      setError(err.message || 'Signed, but failed to refresh invoice details')
    } finally {
      setSigningStage(false)
      setSignFile(null)
    }
  }

  const handleUnlinkProject = async () => {
    setError('')
    setUnlinking(true)
    try {
      const updated = await invoicesApi.unlinkProject(invoice.id, token)
      setInvoice(updated)
      setConfirmingUnlink(false)
    } catch (err) {
      setError(err.message || 'Failed to unlink project')
    } finally {
      setUnlinking(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await invoicesApi.remove(id, token)
      navigate('/invoices')
    } catch (err) {
      setError(err.message || 'Failed to delete invoice')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (loading) return <p className="kt-page-subtitle">Loading {expenseSingularLower}…</p>
  if (!invoice) {
    return (
      <div>
        <div className="kt-auth-error">{error || `${expenseSingular} not found`}</div>
        <Link to="/invoices">Back to {expensesLower}</Link>
      </div>
    )
  }

  // SigningPanel renders itself into a full-screen portal (document.body),
  // so it doesn't need — and shouldn't sit inside — the rest of this page.
  if (signingStage) {
    return (
      <SigningPanel
        invoiceId={invoice.id}
        invoiceFilename={invoice.filename}
        file={signFile}
        token={token}
        user={user}
        onSigned={handleSigned}
        onBack={handleBackFromSigning}
      />
    )
  }

  return (
    <div>
      <p>
        <Link to="/invoices">← Back to {expensesLower}</Link>
      </p>
      <h1 className="kt-page-title">{invoice.supplier || `Untitled ${expenseSingularLower}`}</h1>
      <p className="kt-page-subtitle">
        Uploaded as {invoice.filename} ·{' '}
        {invoice.reviewed ? 'Reviewed' : 'Not yet reviewed'}
        {invoice.duplicate_flag ? ' · Possible duplicate' : ''}
        {invoice.signed ? ' · Signed' : ''}
      </p>

      {canEdit && signingEnabled && invoice.reviewed && (
        <p>
          <button
            type="button"
            className="kt-auth-button"
            onClick={handleOpenSigning}
            disabled={loadingSignFile}
          >
            {loadingSignFile
              ? 'Loading…'
              : invoice.signed
                ? 'Re-sign and export'
                : 'Sign and export'}
          </button>
        </p>
      )}

      {invoice.signed && canEdit && (
        <p>
          <button
            type="button"
            className="kt-category-link-button"
            onClick={handleDownloadSigned}
            disabled={downloadingSigned}
          >
            {downloadingSigned ? 'Downloading…' : 'Download signed PDF'}
          </button>
        </p>
      )}

      <form className="kt-review-fields kt-invoice-detail-form" onSubmit={handleSave}>
        <div className="kt-field">
          <label htmlFor="detail-invoice-date">Invoice date</label>
          <input
            id="detail-invoice-date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            disabled={!canEdit}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="detail-supplier">Supplier</label>
          <input
            id="detail-supplier"
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            disabled={!canEdit}
            maxLength={255}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="detail-amount">Amount (inc. VAT)</label>
          <div className="kt-amount-input">
            <span className="kt-amount-prefix">£</span>
            <input
              id="detail-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>
        </div>

        <div className="kt-field">
          <label htmlFor="detail-category">Category</label>
          <select
            id="detail-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={!canEdit}
          >
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {invoice.project_id != null && (
          <div className="kt-invoice-project-row">
            <Link to={`/projects/${invoice.project_id}`} className="kt-invoice-project-badge">
              {invoice.project_name || `Project #${invoice.project_id}`}
            </Link>
            {canEdit &&
              (confirmingUnlink ? (
                <span className="kt-review-discard-confirm">
                  Unlink from this project?
                  <button
                    type="button"
                    className="kt-category-link-button kt-category-danger"
                    onClick={handleUnlinkProject}
                    disabled={unlinking}
                  >
                    {unlinking ? 'Unlinking…' : 'Yes, unlink'}
                  </button>
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={() => setConfirmingUnlink(false)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => setConfirmingUnlink(true)}
                >
                  Unlink from project
                </button>
              ))}
          </div>
        )}

        <div className="kt-field">
          <label htmlFor="detail-notes">Notes</label>
          <textarea
            id="detail-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
            rows={3}
          />
        </div>

        {error && <div className="kt-auth-error">{error}</div>}

        {canEdit && (
          <div className="kt-review-actions">
            <button type="submit" className="kt-auth-button" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>

            {canDelete &&
              (confirmingDelete ? (
                <span className="kt-review-discard-confirm">
                  Delete this invoice?
                  <button
                    type="button"
                    className="kt-category-link-button kt-category-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    className="kt-category-link-button"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="kt-review-discard-button"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </button>
              ))}
          </div>
        )}
      </form>
    </div>
  )
}
