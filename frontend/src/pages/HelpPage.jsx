import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/AuthContext.jsx'
import { helpApi } from '../utils/api.js'
import { renderGuideMarkdown } from '../help/markdown.js'

const BACK_TO_TOP_THRESHOLD = 300
const DEFAULT_HELP_TOPIC = 'getting-started'

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M20 20l-4.3-4.3" />
    </svg>
  )
}

export default function HelpPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedTopic = searchParams.get('topic')

  const [topics, setTopics] = useState([])
  const [topicsLoaded, setTopicsLoaded] = useState(false)
  const [topicsError, setTopicsError] = useState(false)
  const [activeTopic, setActiveTopic] = useState(requestedTopic || DEFAULT_HELP_TOPIC)
  const [mobileShowContent, setMobileShowContent] = useState(requestedTopic != null)
  const [searchQuery, setSearchQuery] = useState('')
  const [guideTexts, setGuideTexts] = useState({})
  const [guideErrors, setGuideErrors] = useState({})
  const [showBackToTop, setShowBackToTop] = useState(false)

  const contentScrollRef = useRef(null)
  const searchInputRef = useRef(null)

  // List of guides, then all of their content, both come from the backend
  // (the single source of truth for guides — see docs/decisions-log.md).
  // All guides are small — load them all up front so search can match
  // against their content, not just the topic titles, and switching topics
  // never has to wait on a fetch.
  useEffect(() => {
    let cancelled = false

    async function load() {
      let list
      try {
        list = await helpApi.list(user.token)
      } catch {
        if (!cancelled) setTopicsError(true)
        return
      }
      if (cancelled) return

      setTopics(list)
      setTopicsLoaded(true)
      if (!list.some((topic) => topic.key === requestedTopic)) {
        setActiveTopic(list[0]?.key || DEFAULT_HELP_TOPIC)
      }

      const entries = await Promise.all(
        list.map((topic) =>
          helpApi
            .get(topic.key, user.token)
            .then((text) => [topic.key, text, false])
            .catch(() => [topic.key, null, true])
        )
      )
      if (cancelled) return

      const texts = {}
      const errors = {}
      entries.forEach(([key, text, failed]) => {
        if (failed) errors[key] = true
        else texts[key] = text
      })
      setGuideTexts(texts)
      setGuideErrors(errors)
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const topicByKey = useMemo(() => Object.fromEntries(topics.map((t) => [t.key, t])), [topics])
  // Guides link to each other by filename (e.g. "uploading-invoices.md") —
  // maps that back to the topic key so those links can be intercepted.
  const topicByFile = useMemo(() => Object.fromEntries(topics.map((t) => [t.filename, t.key])), [topics])

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return topics
    return topics.filter((topic) => {
      if (topic.title.toLowerCase().includes(q)) return true
      const text = guideTexts[topic.key]
      return typeof text === 'string' && text.toLowerCase().includes(q)
    })
  }, [searchQuery, guideTexts, topics])

  const handleSelectTopic = (key) => {
    setActiveTopic(key)
    setMobileShowContent(true)
    contentScrollRef.current?.scrollTo({ top: 0 })
    setShowBackToTop(false)
  }

  const handleBack = () => setMobileShowContent(false)

  const clearSearch = () => {
    setSearchQuery('')
    searchInputRef.current?.focus()
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') clearSearch()
  }

  const handleContentClick = (e) => {
    const anchor = e.target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    const topicKey = topicByFile[href]
    if (topicKey) {
      e.preventDefault()
      handleSelectTopic(topicKey)
    }
  }

  const handleContentScroll = () => {
    const node = contentScrollRef.current
    if (!node) return
    setShowBackToTop(node.scrollTop > BACK_TO_TOP_THRESHOLD)
  }

  const scrollToTop = () => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeText = guideTexts[activeTopic]
  const activeError = guideErrors[activeTopic]
  const activeLabel = topicByKey[activeTopic]?.title

  return (
    <div>
      <h1 className="kt-page-title">Help</h1>
      <p className="kt-page-subtitle">Guides for getting the most out of Keep Track.</p>

      <div className={`kt-settings-shell${mobileShowContent ? ' show-content' : ''}`}>
        <div className="kt-settings-track">
          <div className="kt-settings-nav-panel">
            <div className="kt-help-search">
              <SearchIcon />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search help topics…"
                aria-label="Search help topics"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="kt-help-search-clear"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {filteredTopics.length === 0 ? (
              <p className="kt-help-no-results">No help topics found for "{searchQuery}"</p>
            ) : (
              <nav className="kt-settings-nav" aria-label="Help topics">
                <ul className="kt-settings-nav-list">
                  {filteredTopics.map((topic) => (
                    <li key={topic.key}>
                      <button
                        type="button"
                        className={`kt-settings-nav-link${activeTopic === topic.key ? ' active' : ''}`}
                        onClick={() => handleSelectTopic(topic.key)}
                      >
                        <span>{topic.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          <div className="kt-settings-content-panel">
            <button type="button" className="kt-settings-back" onClick={handleBack}>
              ← Back to Help
            </button>

            <div
              ref={contentScrollRef}
              className="kt-help-content-scroll"
              onScroll={handleContentScroll}
            >
              {topicsError ? (
                <p className="kt-page-subtitle kt-help-error">
                  Couldn't load help content. Please try again shortly.
                </p>
              ) : !topicsLoaded ? (
                <span className="kt-help-spinner" role="status" aria-label="Loading help topics" />
              ) : activeError ? (
                <p className="kt-page-subtitle kt-help-error">
                  Could not load this guide. Please try again.
                </p>
              ) : activeText == null ? (
                <span className="kt-help-spinner" role="status" aria-label="Loading guide" />
              ) : (
                <div
                  className="kt-help-content"
                  onClick={handleContentClick}
                  dangerouslySetInnerHTML={{ __html: renderGuideMarkdown(activeText) }}
                />
              )}

              {showBackToTop && (
                <button
                  type="button"
                  className="kt-help-back-to-top"
                  onClick={scrollToTop}
                  aria-label={`Back to top of ${activeLabel || 'guide'}`}
                >
                  ↑ Back to top
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
