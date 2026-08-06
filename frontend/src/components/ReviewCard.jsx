import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import SigningPanel from './SigningPanel.jsx'
import { invoicesApi } from '../utils/api.js'
import { formatCurrency } from '../utils/format.js'

// A field is treated as "AI couldn't determine this" when it's still at the
// sentinel empty value the upload endpoint fills in for a NOT NULL column
// when extraction returned nothing — see backend/routers/invoices.py.
function isMissing(value) {
  return value === '' || value === null || value === undefined
}

export default function ReviewCard({ invoice, file, categories, projects = [], signingEnabled, aiStatus, historical = false, onConfirm, onDiscard }) {
  const { user } = useAuth()
  const token = user?.token

  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewFailed, setPreviewFailed] = useState(false)

  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date || '')
  const [supplier, setSupplier] = useState(invoice.supplier || '')
  const [amount, setAmount] = useState(
    Number(invoice.amount) > 0 ? String(invoice.amount) : ''
  )
  const [categoryId, setCategoryId] = useState(
    invoice.category_id != null ? String(invoice.category_id) : ''
  )
  const [notes, setNotes] = useState(invoice.notes || '')
  const [projectId, setProjectId] = useState(
    invoice.project_id != null ? String(invoice.project_id) : ''
  )
  const [projectSearch, setProjectSearch] = useState('')
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const projectBlurTimeout = useRef(null)

  const selectedProject = projects.find((p) => String(p.id) === projectId) || null
  const filteredProjects = projectSearch.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
    : projects

  const openProjectMenu = () => {
    if (projectBlurTimeout.current) clearTimeout(projectBlurTimeout.current)
    setProjectSearch('')
    setProjectMenuOpen(true)
  }
  const closeProjectMenu = () => {
    projectBlurTimeout.current = setTimeout(() => setProjectMenuOpen(false), 150)
  }
  const chooseProject = (id) => {
    if (projectBlurTimeout.current) clearTimeout(projectBlurTimeout.current)
    setProjectId(id)
    setProjectMenuOpen(false)
  }

  // 'fields' = reviewing/correcting extracted data; 'signing' = the
  // draw-and-place-signature step, shown only when signing is enabled.
  const [stage, setStage] = useState('fields')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  // The thumbnail is rendered server-side (backend/services/preview_service.py,
  // via PyMuPDF) rather than client-side with pdf.js — pdf.js was not
  // respecting a PDF's /Rotate page metadata, so rotated invoices previewed
  // upside down and cropped. See docs/decisions-log.md. The full multi-page
  // SigningPanel renderer is unaffected and keeps using pdf.js, which does
  // handle rotation correctly there.
  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    setPreviewUrl(null)
    setPreviewLoading(true)
    setPreviewFailed(false)

    invoicesApi
      .getPreview(invoice.id, token)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
        setPreviewLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setPreviewFailed(true)
        setPreviewLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [invoice.id, token])

  const supplierMissing = isMissing(supplier)
  const amountMissing = !amount || Number(amount) <= 0
  const categoryMissing = isMissing(categoryId)
  const anyFieldMissing = supplierMissing || amountMissing || categoryMissing

  // aiStatus is null while it's still loading (or failed to load) — no
  // banner in that case, since we don't yet know whether AI is on.
  const aiDisabled = aiStatus != null && !aiStatus.enabled
  const aiNotConfigured = aiStatus != null && aiStatus.enabled && !aiStatus.configured
  const aiFailedThisInvoice = aiStatus != null && aiStatus.enabled && aiStatus.configured && anyFieldMissing

  const handleContinue = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await invoicesApi.update(
        invoice.id,
        {
          invoice_date: invoiceDate,
          supplier: supplier.trim(),
          amount: Number(amount),
          category_id: categoryId ? Number(categoryId) : null,
          notes: notes.trim() || null,
          project_id: projectId ? Number(projectId) : null,
        },
        token
      )
      if (signingEnabled && !historical) {
        setStage('signing')
      } else {
        const confirmed = await invoicesApi.confirm(invoice.id, token)
        onConfirm(confirmed)
      }
    } catch (err) {
      setError(err.message || 'Failed to save invoice')
    } finally {
      setSaving(false)
    }
  }

  // Called once SigningPanel has embedded the signature into a signed PDF
  // and triggered its download — the last step is writing the invoice's
  // reviewed flag so it moves into the confirmed invoice list.
  const handleSigned = async () => {
    try {
      const confirmed = await invoicesApi.confirm(invoice.id, token)
      onConfirm(confirmed)
    } catch (err) {
      setError(err.message || 'Signed, but failed to confirm the invoice')
      setStage('fields')
    }
  }

  const handleDiscard = async () => {
    setError('')
    setDiscarding(true)
    try {
      await invoicesApi.remove(invoice.id, token)
      onDiscard(invoice.id)
    } catch (err) {
      setError(err.message || 'Failed to discard invoice')
      setDiscarding(false)
      setConfirmingDiscard(false)
    }
  }

  // SigningPanel renders itself into a full-screen portal (document.body),
  // so it doesn't need — and shouldn't sit inside — the rest of this card.
  if (stage === 'signing') {
    return (
      <SigningPanel
        invoiceId={invoice.id}
        invoiceFilename={invoice.filename}
        file={file}
        token={token}
        onSigned={handleSigned}
        onBack={() => setStage('fields')}
      />
    )
  }

  return (
    <div className="kt-review-card">
      {historical && (
        <div className="kt-review-historical-banner">
          Historical import — signing not required
        </div>
      )}
      {aiDisabled && (
        <div className="kt-review-ai-banner kt-review-ai-banner-info">
          AI extraction is disabled — please fill in all fields manually.
        </div>
      )}
      {aiNotConfigured && (
        <div className="kt-review-ai-banner kt-review-ai-banner-warning">
          AI not configured — fields must be filled in manually.{' '}
          <Link to="/settings?section=ai">Configure AI in Settings</Link>.
        </div>
      )}
      {aiFailedThisInvoice && (
        <div className="kt-review-ai-banner kt-review-ai-banner-warning">
          AI couldn't extract some fields for this invoice — please check and fill them in below.
          If this keeps happening, check your AI configuration in{' '}
          <Link to="/settings?section=ai">Settings → AI & Extraction</Link>.
        </div>
      )}

      {invoice.duplicate_flag && (
        <div className="kt-review-duplicate-banner">
          ⚠ This looks like it might be a duplicate of an invoice already on file
          — same supplier, a similar amount, and a nearby date. Check before confirming.
        </div>
      )}

      <div className="kt-review-body">
        <div className="kt-review-preview">
          {previewLoading ? (
            <div className="kt-review-preview-spinner" role="status" aria-label="Loading preview" />
          ) : previewFailed ? (
            <div className="kt-review-preview-error">
              Preview not available — please check the original PDF
              <div className="kt-review-preview-filename">{invoice.filename}</div>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt={`Preview of ${invoice.filename}`}
              className="kt-review-canvas"
              onError={() => {
                setPreviewFailed(true)
                setPreviewUrl(null)
              }}
            />
          )}
        </div>

        <form className="kt-review-fields" onSubmit={handleContinue}>
          <div className="kt-field">
            <label htmlFor={`invoice-date-${invoice.id}`}>Invoice date</label>
            <input
              id={`invoice-date-${invoice.id}`}
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </div>

          <div className="kt-field">
            <label htmlFor={`supplier-${invoice.id}`}>Supplier</label>
            <input
              id={`supplier-${invoice.id}`}
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className={supplierMissing ? 'kt-field-needs-attention' : ''}
              placeholder="AI couldn't read the supplier — enter it manually"
              maxLength={255}
              required
            />
            {supplierMissing && <span className="kt-field-hint">Please fill this in</span>}
          </div>

          <div className="kt-field">
            <label htmlFor={`amount-${invoice.id}`}>Amount (inc. VAT)</label>
            <div className={`kt-amount-input${amountMissing ? ' kt-field-needs-attention' : ''}`}>
              <span className="kt-amount-prefix">£</span>
              <input
                id={`amount-${invoice.id}`}
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            {amountMissing && <span className="kt-field-hint">Please fill this in</span>}
          </div>

          <div className="kt-field">
            <label htmlFor={`category-${invoice.id}`}>Category</label>
            <select
              id={`category-${invoice.id}`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={categoryMissing ? 'kt-field-needs-attention' : ''}
            >
              <option value="">Select a category…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {categoryMissing && <span className="kt-field-hint">Please choose a category</span>}
          </div>

          <div className="kt-field">
            <label htmlFor={`project-${invoice.id}`}>Link to project (optional)</label>
            <div className="kt-project-select">
              <input
                id={`project-${invoice.id}`}
                type="text"
                autoComplete="off"
                placeholder="Search projects…"
                value={projectMenuOpen ? projectSearch : selectedProject ? selectedProject.name : ''}
                onFocus={openProjectMenu}
                onChange={(e) => setProjectSearch(e.target.value)}
                onBlur={closeProjectMenu}
              />
              {projectMenuOpen && (
                <ul className="kt-project-select-menu">
                  <li
                    className="kt-project-select-option kt-project-select-none"
                    onMouseDown={() => chooseProject('')}
                  >
                    None
                  </li>
                  {filteredProjects.map((p) => (
                    <li
                      key={p.id}
                      className="kt-project-select-option"
                      onMouseDown={() => chooseProject(String(p.id))}
                    >
                      <span>{p.name}</span>
                      <span className="kt-project-select-cost">{formatCurrency(p.estimated_cost)}</span>
                    </li>
                  ))}
                  {filteredProjects.length === 0 && (
                    <li className="kt-project-select-empty">No matching projects</li>
                  )}
                </ul>
              )}
            </div>
            <span className="kt-field-hint-plain">
              Link this invoice to a project to track actual spend
            </span>
          </div>

          <div className="kt-field">
            <label htmlFor={`notes-${invoice.id}`}>Notes</label>
            <textarea
              id={`notes-${invoice.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="kt-auth-error">{error}</div>}

          <div className="kt-review-actions">
            <button type="submit" className="kt-auth-button" disabled={saving || discarding}>
              {saving ? 'Saving…' : signingEnabled && !historical ? 'Continue to sign' : 'Confirm'}
            </button>

            {confirmingDiscard ? (
              <span className="kt-review-discard-confirm">
                Discard this invoice?
                <button
                  type="button"
                  className="kt-category-link-button kt-category-danger"
                  onClick={handleDiscard}
                  disabled={discarding}
                >
                  {discarding ? 'Discarding…' : 'Yes, discard'}
                </button>
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => setConfirmingDiscard(false)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="kt-review-discard-button"
                onClick={() => setConfirmingDiscard(true)}
                disabled={saving || discarding}
              >
                Discard
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
