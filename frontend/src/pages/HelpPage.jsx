import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HELP_TOPICS, HELP_TOPIC_BY_KEY, HELP_TOPIC_BY_FILE, DEFAULT_HELP_TOPIC } from '../help/topics.js'
import { renderGuideMarkdown } from '../help/markdown.js'

const BACK_TO_TOP_THRESHOLD = 300

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M20 20l-4.3-4.3" />
    </svg>
  )
}

export default function HelpPage() {
  const [searchParams] = useSearchParams()
  const requestedTopic = searchParams.get('topic')
  const initialTopic = HELP_TOPIC_BY_KEY[requestedTopic] ? requestedTopic : DEFAULT_HELP_TOPIC

  const [activeTopic, setActiveTopic] = useState(initialTopic)
  const [mobileShowContent, setMobileShowContent] = useState(requestedTopic != null)
  const [searchQuery, setSearchQuery] = useState('')
  const [guideTexts, setGuideTexts] = useState({})
  const [loadError, setLoadError] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const contentScrollRef = useRef(null)
  const searchInputRef = useRef(null)

  // All eight guides are small — load them all up front so search can match
  // against their content, not just the topic titles, and switching topics
  // never has to wait on a fetch.
  useEffect(() => {
    let cancelled = false
    Promise.all(
      HELP_TOPICS.map((topic) =>
        fetch(`/help-guides/${topic.file}`)
          .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
          .then((text) => [topic.key, text])
          .catch(() => [topic.key, null])
      )
    ).then((entries) => {
      if (cancelled) return
      const texts = Object.fromEntries(entries)
      setGuideTexts(texts)
      if (Object.values(texts).every((t) => t == null)) setLoadError(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return HELP_TOPICS
    return HELP_TOPICS.filter((topic) => {
      if (topic.label.toLowerCase().includes(q)) return true
      const text = guideTexts[topic.key]
      return typeof text === 'string' && text.toLowerCase().includes(q)
    })
  }, [searchQuery, guideTexts])

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

  // Guides link to each other by filename (e.g. "uploading-invoices.md") —
  // intercept those clicks and route within the Help page instead of
  // requesting the raw markdown file.
  const handleContentClick = (e) => {
    const anchor = e.target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    const topicKey = HELP_TOPIC_BY_FILE[href]
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
  const activeLabel = HELP_TOPIC_BY_KEY[activeTopic]?.label

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
                        <span>{topic.label}</span>
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
              {loadError ? (
                <p className="kt-page-subtitle">
                  Couldn't load help content. Please try again shortly.
                </p>
              ) : activeText == null ? (
                <p className="kt-page-subtitle">Loading…</p>
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
