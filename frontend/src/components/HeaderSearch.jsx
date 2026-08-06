import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { searchApi } from '../utils/api.js'
import { formatCurrency } from '../utils/format.js'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
const INSTANT_RESULT_COUNT = 5

function SearchIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// `expanded`/`onExpandedChange` are controlled by Header.jsx (not local
// state) so it can hide the brand/wordmark at mobile widths while search is
// active — the header has nowhere near enough width at a phone viewport to
// show the brand, an expanded search field, *and* the profile button all at
// once, and the previous local-state version left the expanded field
// visually overlapping the logo. See docs/decisions-log.md.
export default function HeaderSearch({ expanded, onExpandedChange }) {
  const { user } = useAuth()
  const token = user?.token
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // { total, results } | null
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Cmd+K (Mac) / Ctrl+K (Windows/Linux) focuses the search bar from
  // anywhere in the app — a global listener, not one scoped to this
  // component's own DOM, since the whole point is it works even when
  // focus is somewhere else entirely (a form field on another page).
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onExpandedChange(true)
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced instant search — top invoice results only, while the user is
  // still typing. The full three-section results only load on /search.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null)
      setLoading(false)
      return undefined
    }
    setLoading(true)
    const timer = window.setTimeout(() => {
      searchApi
        .search({ q: trimmed, type: 'invoices', perPage: INSTANT_RESULT_COUNT }, token)
        .then((data) => {
          setResults({ total: data.invoices.total, results: data.invoices.results })
          setDropdownOpen(true)
        })
        .catch(() => setResults(null))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, token])

  // Close on click outside or Escape — also gated on `expanded`, not just
  // `dropdownOpen`, so tapping the mobile search icon with nothing typed
  // yet (no dropdown to close) still collapses back to icon-only on an
  // outside tap rather than leaving the field stuck open with no visible
  // way back to the brand/nav.
  useEffect(() => {
    if (!dropdownOpen && !expanded) return undefined
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false)
        onExpandedChange(false)
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false)
        onExpandedChange(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [dropdownOpen, expanded, onExpandedChange])

  const goToFullResults = (q) => {
    const trimmed = (q ?? query).trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return
    setDropdownOpen(false)
    onExpandedChange(false)
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      goToFullResults()
    }
  }

  const handleResultClick = (invoiceId) => {
    setDropdownOpen(false)
    onExpandedChange(false)
    navigate(`/invoices/${invoiceId}`)
  }

  const showDropdown = dropdownOpen && query.trim().length >= MIN_QUERY_LENGTH

  return (
    <div className={`kt-header-search${expanded ? ' kt-header-search-expanded' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="kt-header-search-toggle"
        onClick={() => {
          onExpandedChange(!expanded)
          window.setTimeout(() => inputRef.current?.focus(), 0)
        }}
        aria-label="Search"
      >
        <SearchIcon />
      </button>

      <div className="kt-header-search-field">
        <SearchIcon className="kt-header-search-field-icon" />
        <input
          ref={inputRef}
          type="text"
          className="kt-header-search-input"
          placeholder="Search invoices, projects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length >= MIN_QUERY_LENGTH) setDropdownOpen(true)
          }}
          aria-label="Search invoices, projects, and contributions"
        />
      </div>

      {showDropdown && (
        <div className="kt-search-dropdown">
          {loading && !results ? (
            <div className="kt-search-dropdown-empty">Searching…</div>
          ) : !results || results.results.length === 0 ? (
            <div className="kt-search-dropdown-empty">No results for "{query.trim()}"</div>
          ) : (
            <>
              <ul className="kt-search-dropdown-list">
                {results.results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="kt-search-dropdown-item"
                      onClick={() => handleResultClick(r.id)}
                    >
                      <span className="kt-search-dropdown-item-main">
                        <span className="kt-search-dropdown-item-supplier">
                          {r.supplier || <em>Unknown supplier</em>}
                        </span>
                        <span className="kt-search-dropdown-item-date">{r.invoice_date}</span>
                      </span>
                      <span className="kt-search-dropdown-item-meta">
                        {r.category_name && (
                          <span className="kt-invoice-category">
                            <span
                              className="kt-category-swatch"
                              style={{ background: r.category_colour }}
                              aria-hidden="true"
                            />
                            {r.category_name}
                          </span>
                        )}
                        <span className="kt-search-dropdown-item-amount">{formatCurrency(r.amount)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="kt-search-dropdown-see-all" onClick={() => goToFullResults()}>
                See all {results.total} result{results.total === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
