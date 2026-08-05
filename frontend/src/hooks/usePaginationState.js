import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const STORAGE_PREFIX = 'keeptrack-per-page-'

function readStoredPerPage(storageKey) {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
  } catch {
    return null
  }
}

function writeStoredPerPage(storageKey, value) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, value)
  } catch {
    // localStorage unavailable (e.g. private browsing) — the preference
    // just won't persist across visits, which is a harmless degradation.
  }
}

// Shared page/per-page state for every paginated list view. The URL's
// `page`/`per_page` query params are the source of truth (so links are
// shareable and browser back/forward "just work" — both read straight from
// useSearchParams rather than mirrored local state that could drift out of
// sync with it); a per-list localStorage key remembers the user's last
// per-page choice across visits, per docs' "Invoices remembers its own
// preference, Users remembers its own" requirement.
export function usePaginationState(storageKey, defaultPerPage = '25') {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const perPage = searchParams.get('per_page') || readStoredPerPage(storageKey) || defaultPerPage

  const setPage = useCallback(
    (nextPage) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('page', String(nextPage))
        return next
      })
    },
    [setSearchParams]
  )

  const setPerPage = useCallback(
    (value) => {
      writeStoredPerPage(storageKey, value)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('per_page', value)
        next.set('page', '1')
        return next
      })
    },
    [setSearchParams, storageKey]
  )

  // A fresh visit (or a shared link with no explicit per_page) seeds the
  // URL from localStorage/the default, so the address bar is shareable
  // immediately rather than only after the user first touches the control.
  useEffect(() => {
    if (!searchParams.get('per_page') || !searchParams.get('page')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!next.get('per_page')) next.set('per_page', perPage)
          if (!next.get('page')) next.set('page', '1')
          return next
        },
        { replace: true }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { page, perPage, setPage, setPerPage }
}

// Maps the UI's per-page value ('10' | '25' | '50' | '100' | 'all') to the
// numeric `per_page` query param the backend expects (<=0 means "no limit").
export function perPageParam(perPage) {
  return perPage === 'all' ? 0 : Number(perPage)
}
