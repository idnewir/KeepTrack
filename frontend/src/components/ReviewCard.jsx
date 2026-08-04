import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import SigningPanel from './SigningPanel.jsx'
import { invoicesApi } from '../utils/api.js'
import { renderPdfFirstPage } from '../utils/pdf.js'

// A field is treated as "AI couldn't determine this" when it's still at the
// sentinel empty value the upload endpoint fills in for a NOT NULL column
// when extraction returned nothing — see backend/routers/invoices.py.
function isMissing(value) {
  return value === '' || value === null || value === undefined
}

export default function ReviewCard({ invoice, file, categories, signingEnabled, onConfirm, onDiscard }) {
  const { user } = useAuth()
  const token = user?.token

  const canvasRef = useRef(null)
  const [previewError, setPreviewError] = useState('')

  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date || '')
  const [supplier, setSupplier] = useState(invoice.supplier || '')
  const [amount, setAmount] = useState(
    Number(invoice.amount) > 0 ? String(invoice.amount) : ''
  )
  const [categoryId, setCategoryId] = useState(
    invoice.category_id != null ? String(invoice.category_id) : ''
  )
  const [notes, setNotes] = useState(invoice.notes || '')

  // 'fields' = reviewing/correcting extracted data; 'signing' = the
  // draw-and-place-signature step, shown only when signing is enabled.
  const [stage, setStage] = useState('fields')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (file && canvasRef.current) {
      renderPdfFirstPage(file, canvasRef.current).catch((err) => {
        if (!cancelled) setPreviewError(err.message || 'Could not preview this PDF')
      })
    }
    return () => {
      cancelled = true
    }
  }, [file])

  const supplierMissing = isMissing(supplier)
  const amountMissing = !amount || Number(amount) <= 0
  const categoryMissing = isMissing(categoryId)

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
        },
        token
      )
      if (signingEnabled) {
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

  return (
    <div className="kt-review-card">
      {invoice.duplicate_flag && (
        <div className="kt-review-duplicate-banner">
          ⚠ This looks like it might be a duplicate of an invoice already on file
          — same supplier, a similar amount, and a nearby date. Check before confirming.
        </div>
      )}

      {stage === 'signing' ? (
        <SigningPanel
          invoiceId={invoice.id}
          invoiceFilename={invoice.filename}
          file={file}
          token={token}
          onSigned={handleSigned}
          onBack={() => setStage('fields')}
        />
      ) : (
      <div className="kt-review-body">
        <div className="kt-review-preview">
          {previewError ? (
            <div className="kt-review-preview-error">{previewError}</div>
          ) : (
            <canvas ref={canvasRef} className="kt-review-canvas" />
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
              {saving ? 'Saving…' : signingEnabled ? 'Continue to sign' : 'Confirm'}
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
      )}
    </div>
  )
}
