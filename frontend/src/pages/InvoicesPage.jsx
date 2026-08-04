import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { categoriesApi, invoicesApi } from '../utils/api.js'

const REVIEWED_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'false', label: 'Unreviewed' },
  { value: 'true', label: 'Reviewed' },
]

function formatAmount(amount) {
  return `£${Number(amount).toFixed(2)}`
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const canUpload = user?.role !== 'readonly'

  const [categories, setCategories] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [categoryId, setCategoryId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reviewed, setReviewed] = useState('')

  useEffect(() => {
    categoriesApi.list(token).then(setCategories).catch(() => setCategories([]))
  }, [token])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    invoicesApi
      .list({ categoryId, dateFrom, dateTo, reviewed }, token)
      .then((data) => {
        if (!cancelled) setInvoices(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load invoices')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [categoryId, dateFrom, dateTo, reviewed, token])

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  return (
    <div>
      <div className="kt-invoices-header">
        <div>
          <h1 className="kt-page-title">Invoices</h1>
          <p className="kt-page-subtitle">Every invoice on file, with its review status.</p>
        </div>
        {canUpload && (
          <Link to="/upload" className="kt-auth-button kt-invoices-upload-button">
            + Upload invoice
          </Link>
        )}
      </div>

      <div className="kt-invoices-filters">
        <div className="kt-field">
          <label htmlFor="filter-category">Category</label>
          <select id="filter-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="kt-field">
          <label htmlFor="filter-from">From</label>
          <input id="filter-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>

        <div className="kt-field">
          <label htmlFor="filter-to">To</label>
          <input id="filter-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="kt-field">
          <label htmlFor="filter-reviewed">Status</label>
          <select id="filter-reviewed" value={reviewed} onChange={(e) => setReviewed(e.target.value)}>
            {REVIEWED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="kt-auth-error">{error}</div>}

      {loading ? (
        <p className="kt-page-subtitle">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <div className="kt-categories-empty">No invoices match these filters.</div>
      ) : (
        <table className="kt-invoices-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const category = invoice.category_id != null ? categoryById.get(invoice.category_id) : null
              return (
                <tr
                  key={invoice.id}
                  className="kt-invoice-row"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <td>{invoice.invoice_date}</td>
                  <td>{invoice.supplier || <em>Unknown supplier</em>}</td>
                  <td>{formatAmount(invoice.amount)}</td>
                  <td>
                    {category ? (
                      <span className="kt-invoice-category">
                        <span
                          className="kt-category-swatch"
                          style={{ background: category.colour }}
                          aria-hidden="true"
                        />
                        {category.name}
                      </span>
                    ) : (
                      <em>Uncategorised</em>
                    )}
                  </td>
                  <td>
                    {invoice.reviewed ? (
                      <span className="kt-status-badge kt-status-reviewed">Reviewed</span>
                    ) : (
                      <span className="kt-status-badge kt-status-unreviewed">Unreviewed</span>
                    )}
                    {invoice.duplicate_flag && (
                      <span className="kt-status-badge kt-status-duplicate">Possible duplicate</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
