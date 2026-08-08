import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { usePaginationState, perPageParam } from '../hooks/usePaginationState.js'
import { searchApi } from '../utils/api.js'
import { formatCurrency, MONTH_NAMES } from '../utils/format.js'
import { renderHighlightedSnippet } from '../utils/highlight.jsx'
import { INVOICE_BADGE_TOOLTIPS, PROJECT_BADGE_TOOLTIPS } from '../utils/badgeTooltips.js'
import PaginationBar from '../components/PaginationBar.jsx'
import Tooltip from '../components/Tooltip.jsx'

const MIN_QUERY_LENGTH = 2

const PROJECT_STATUS_LABELS = {
  planning: 'Planning',
  in_progress: 'In progress',
  completed: 'Complete',
  over_budget: 'Over budget',
}

export default function SearchResultsPage() {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''

  const { page, perPage, setPage, setPerPage } = usePaginationState('search')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tooShort = query.trim().length < MIN_QUERY_LENGTH

  useEffect(() => {
    if (tooShort) {
      setData(null)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    searchApi
      .search({ q: query.trim(), type: 'all', page, perPage: perPageParam(perPage) }, token)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Search failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, perPage, token, tooShort])

  return (
    <div>
      <h1 className="kt-page-title">Search</h1>
      <p className="kt-page-subtitle">
        {query ? (
          <>
            Results for <strong>&ldquo;{query}&rdquo;</strong>
          </>
        ) : (
          'Search across invoices, contributions, and projects.'
        )}
      </p>

      {tooShort ? (
        <div className="kt-search-state-message">
          {query
            ? 'Enter at least 2 characters to search'
            : 'Type a search term above to get started.'}
        </div>
      ) : error ? (
        <div className="kt-auth-error">{error}</div>
      ) : loading && !data ? (
        <p className="kt-page-subtitle">Searching…</p>
      ) : data && data.total === 0 ? (
        <div className="kt-search-empty-state">
          <p className="kt-search-empty-title">No results for &ldquo;{query}&rdquo;</p>
          <p className="kt-search-empty-hint">
            Try searching for a supplier name, amount, or date.
          </p>
        </div>
      ) : data ? (
        <div className="kt-search-sections">
          <section className="kt-search-section">
            <h2 className="kt-panel-title">
              Invoices <span className="kt-search-section-count">({data.invoices.total})</span>
            </h2>
            {data.invoices.results.length === 0 ? (
              <div className="kt-categories-empty">No matching invoices.</div>
            ) : (
              <>
                <table className="kt-invoices-table kt-search-invoices-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Supplier</th>
                      <th>Amount</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.results.map((r) => (
                      <tr
                        key={r.id}
                        className="kt-invoice-row"
                        onClick={() => navigate(`/invoices/${r.id}`)}
                      >
                        <td>{r.invoice_date}</td>
                        <td>
                          {r.supplier || <em>Unknown supplier</em>}
                          {r.is_historical && (
                            <Tooltip content={INVOICE_BADGE_TOOLTIPS.historical}>
                              <span className="kt-status-badge kt-status-historical">Historical</span>
                            </Tooltip>
                          )}
                        </td>
                        <td>{formatCurrency(r.amount)}</td>
                        <td>
                          {r.category_name ? (
                            <span className="kt-invoice-category">
                              <span
                                className="kt-category-swatch"
                                style={{ background: r.category_colour }}
                                aria-hidden="true"
                              />
                              {r.category_name}
                            </span>
                          ) : (
                            <em>Uncategorised</em>
                          )}
                        </td>
                        <td>
                          {r.reviewed ? (
                            <Tooltip content={INVOICE_BADGE_TOOLTIPS.reviewed}>
                              <span className="kt-status-badge kt-status-reviewed">Reviewed</span>
                            </Tooltip>
                          ) : (
                            <Tooltip content={INVOICE_BADGE_TOOLTIPS.unreviewed}>
                              <span className="kt-status-badge kt-status-unreviewed">Unreviewed</span>
                            </Tooltip>
                          )}
                          {r.signed && (
                            <Tooltip content={INVOICE_BADGE_TOOLTIPS.signed}>
                              <span className="kt-status-badge kt-status-signed">Signed</span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="kt-search-snippet-cell">
                          {r.snippet ? renderHighlightedSnippet(r.snippet) : <em>—</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationBar
                  pagination={data.invoices.pagination}
                  perPage={perPage}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                  disabled={loading}
                />
              </>
            )}
          </section>

          <section className="kt-search-section">
            <h2 className="kt-panel-title">
              Contributions <span className="kt-search-section-count">({data.contributions.total})</span>
            </h2>
            {data.contributions.results.length === 0 ? (
              <div className="kt-categories-empty">No matching contributions.</div>
            ) : (
              <ul className="kt-search-list">
                {data.contributions.results.map((r) => (
                  <li key={r.id}>
                    <Link to={`/contributions?month=${r.month}`} className="kt-search-list-item">
                      <span className="kt-search-list-item-main">
                        <span className="kt-search-list-item-title">{r.group_name}</span>
                        <span className="kt-search-list-item-sub">{MONTH_NAMES[r.month - 1]}</span>
                      </span>
                      <span className="kt-search-list-item-amount">{formatCurrency(r.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="kt-search-section">
            <h2 className="kt-panel-title">
              Projects <span className="kt-search-section-count">({data.projects.total})</span>
            </h2>
            {data.projects.results.length === 0 ? (
              <div className="kt-categories-empty">No matching projects.</div>
            ) : (
              <ul className="kt-search-list">
                {data.projects.results.map((r) => (
                  <li key={r.id}>
                    <Link to={`/projects/${r.id}`} className="kt-search-list-item">
                      <span className="kt-search-list-item-main">
                        <span className="kt-search-list-item-title">{r.name}</span>
                        {r.status && (
                          r.status === 'over_budget' ? (
                            <Tooltip content={PROJECT_BADGE_TOOLTIPS.overBudget}>
                              <span className={`kt-project-status-badge kt-project-status-${r.status}`}>
                                {PROJECT_STATUS_LABELS[r.status] || r.status}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className={`kt-project-status-badge kt-project-status-${r.status}`}>
                              {PROJECT_STATUS_LABELS[r.status] || r.status}
                            </span>
                          )
                        )}
                      </span>
                      <span className="kt-search-list-item-amount">{formatCurrency(r.estimated_cost)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}
