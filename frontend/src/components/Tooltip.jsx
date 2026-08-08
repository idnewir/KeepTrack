import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY_MS = 300
const GAP_PX = 9

// Reusable hover/tap tooltip. Wraps `children` (a badge, an info icon, any
// inline trigger) in a span that owns the show/hide behaviour, and portals
// the bubble itself into document.body rather than rendering it as a normal
// child — this app's status badges mostly live inside table cells
// (`.kt-invoices-table td { overflow: hidden }`, reused by the invoices,
// reconciliation, and several other tables, for text truncation), and a
// bubble positioned relative to its own trigger would be silently clipped
// by that ancestor the moment it tried to pop outside the cell's box. The
// portal escapes the clip; a `position: fixed` + `getBoundingClientRect()`
// pair (recomputed on show, scroll, and resize) keeps it visually anchored
// to the trigger regardless of where in the DOM it actually renders. See
// docs/decisions-log.md.
//
// The bubble is only mounted while visible (not kept in the DOM and faded)
// since a fixed-positioned portal has nothing to fade "in place" — but the
// trigger's `aria-describedby` still points at a stable id, and role=
// "tooltip" plus the description text both exist in the accessibility tree
// for exactly as long as the tooltip is actually shown, which is the
// correct lifetime for a transient hint like this one.
//
// Desktop hover shows after a 300ms delay (avoids flashing while the
// pointer passes over on its way elsewhere). Touch shows/hides instantly on
// tap, detected via the trigger's own pointerdown event rather than a
// device-wide check, so a mouse-and-touchscreen laptop still gets the right
// behaviour for whichever input actually triggered it. A touch-opened
// tooltip also stops that tap's click from reaching the trigger's own
// parent (e.g. a table row that navigates on click) — the tap's job is to
// reveal the explanation, not to also fire whatever the row underneath it
// does; a plain mouse click is left alone so existing click-through
// behaviour (e.g. "click an Unreviewed badge to open the invoice") is
// unaffected.
export default function Tooltip({ content, children, position = 'top', className = '' }) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState(null)
  const showTimer = useRef(null)
  const isTouchRef = useRef(false)
  const wrapRef = useRef(null)
  const tooltipId = useId()

  const clearShowTimer = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
  }

  const hide = () => {
    clearShowTimer()
    setVisible(false)
  }

  const handleMouseEnter = () => {
    if (isTouchRef.current) return
    clearShowTimer()
    showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
  }

  const handleMouseLeave = () => {
    if (isTouchRef.current) return
    hide()
  }

  const handlePointerDown = (e) => {
    isTouchRef.current = e.pointerType === 'touch'
  }

  const handleClick = (e) => {
    if (!isTouchRef.current) return
    e.preventDefault()
    e.stopPropagation()
    setVisible((v) => !v)
  }

  const handleFocus = () => {
    clearShowTimer()
    setVisible(true)
  }

  // Recomputes the trigger's viewport position whenever the tooltip is
  // shown, and keeps it in sync with scrolling/resizing while it stays
  // open — a `position: fixed` coordinate is a snapshot, not a live
  // relationship, so without this the bubble would drift away from its
  // trigger the moment the page (or a scrollable table) moved under it.
  useLayoutEffect(() => {
    if (!visible || !wrapRef.current) return undefined
    const updateCoords = () => {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      setCoords({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      })
    }
    updateCoords()
    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') hide()
    }
    // Dismisses a tap-opened tooltip when the next tap/click lands outside
    // it — hover-opened ones already close on mouseleave.
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) hide()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handleOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handleOutside)
    }
  }, [visible])

  useEffect(() => () => clearShowTimer(), [])

  const bubbleStyle = coords ? positionStyle(position, coords) : undefined

  return (
    <span
      ref={wrapRef}
      className={`kt-tooltip-wrap${className ? ` ${className}` : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={hide}
      aria-describedby={tooltipId}
    >
      {children}
      {visible &&
        coords &&
        createPortal(
          <span
            role="tooltip"
            id={tooltipId}
            className={`kt-tooltip kt-tooltip-${position} kt-tooltip-visible`}
            style={bubbleStyle}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  )
}

function positionStyle(position, coords) {
  switch (position) {
    case 'bottom':
      return { top: coords.bottom + GAP_PX, left: coords.centerX, transform: 'translate(-50%, 0)' }
    case 'left':
      return { top: coords.centerY, left: coords.left - GAP_PX, transform: 'translate(-100%, -50%)' }
    case 'right':
      return { top: coords.centerY, left: coords.right + GAP_PX, transform: 'translate(0, -50%)' }
    case 'top':
    default:
      return { top: coords.top - GAP_PX, left: coords.centerX, transform: 'translate(-50%, -100%)' }
  }
}

// The (i) glyph used to trigger a tooltip where there's no other natural
// hover target (a notification title, a dashboard banner) — see InfoTooltip
// below. Shares its shape with NotificationBell.jsx's own "info" severity
// icon so the two read as the same visual language.
function InfoGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 11v5.5" />
      <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Convenience wrapper for the "standalone info icon" case (Parts 1 and 2 of
// the callout-tooltips brief: a small (i) next to a notification title or
// at the right of a dashboard banner) — a focusable, labelled button so
// keyboard and screen reader users get the same access to it as a mouse or
// touch user. Renders nothing when `content` is empty, so callers can pass
// a possibly-missing lookup result directly without an extra guard.
export function InfoTooltip({ content, position = 'top', label = 'More information' }) {
  if (!content) return null
  return (
    <Tooltip content={content} position={position}>
      <button type="button" className="kt-info-icon-btn" aria-label={label}>
        <InfoGlyph />
      </button>
    </Tooltip>
  )
}
