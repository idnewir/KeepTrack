// Splits a ts_headline snippet from the backend (services/search_service.py)
// on its \x01/\x02 match markers and wraps the matched spans in a real
// <mark> element, rather than rendering backend-supplied HTML directly —
// this app renders no dangerouslySetInnerHTML anywhere (see
// docs/security.md), and search snippets are built from invoice/project/
// contribution text, which isn't trusted content.
const MARKER_RE = /[\x01\x02]/

export function renderHighlightedSnippet(text) {
  if (!text) return null
  const parts = text.split(MARKER_RE)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="kt-search-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  )
}
