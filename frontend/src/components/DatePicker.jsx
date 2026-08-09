import { useEffect, useRef, useState } from 'react'
import { MONTH_NAMES } from '../utils/format.js'

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3))
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const YEAR_RANGE_SPAN = 10 // shown range is centre year +/- this many years

function pad2(n) {
  return String(n).padStart(2, '0')
}

function isoFrom(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

// 'YYYY-MM-DD' -> { year, month (0-11), day 1 }, validating real calendar
// dates (rejects e.g. 2024-02-30) rather than trusting the regex alone.
function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(year, month, day)
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null
  return { year, month, day }
}

function formatDisplay(iso) {
  const parsed = parseIso(iso)
  return parsed ? `${pad2(parsed.day)}/${pad2(parsed.month + 1)}/${parsed.year}` : ''
}

// Typed 'DD/MM/YYYY' -> 'YYYY-MM-DD', or null while incomplete/invalid.
function parseTyped(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2]) - 1
  const year = Number(m[3])
  const d = new Date(year, month, day)
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null
  return isoFrom(year, month, day)
}

// Reformats raw input as DD/MM/YYYY, inserting slashes as digits arrive so
// the user never has to type them. Non-digit characters (including slashes
// the browser just inserted) are stripped and recomputed from the digit
// stream alone, which is what makes backspacing through a slash behave
// naturally instead of getting stuck on it.
function autoSlash(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return digits
}

function digitsBeforeCursor(raw, cursorPos) {
  return raw.slice(0, cursorPos).replace(/\D/g, '').length
}

// Inverse of autoSlash's slash placement, so the cursor can be restored to
// "just after the digit the user typed" rather than jumping to the end of
// the field on every keystroke.
function cursorForDigitCount(n) {
  let pos = n
  if (n > 2) pos += 1
  if (n > 4) pos += 1
  return pos
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// JS Date.getDay() is Sunday-first (0-6); this app's calendars read Monday-first.
function mondayIndex(jsDay) {
  return (jsDay + 6) % 7
}

// 42 cells (6 full weeks) so the grid is a stable height across months —
// swapping between a 4-week and 6-week February/January view would jump
// the footer/dropdown around.
function buildDayGrid(year, month) {
  const leading = mondayIndex(new Date(year, month, 1).getDay())
  const monthLength = daysInMonth(year, month)
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const prevMonthLength = daysInMonth(prevYear, prevMonth)
  const nextMonth = month === 11 ? 0 : month + 1
  const nextYear = month === 11 ? year + 1 : year

  const cells = []
  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ year: prevYear, month: prevMonth, day: prevMonthLength - i, inCurrentMonth: false })
  }
  for (let d = 1; d <= monthLength; d++) {
    cells.push({ year, month, day: d, inCurrentMonth: true })
  }
  let trailing = 1
  while (cells.length < 42) {
    cells.push({ year: nextYear, month: nextMonth, day: trailing, inCurrentMonth: false })
    trailing++
  }
  return cells
}

// Financial-year order for the month quick-picker (e.g. Sep, Oct, ... Aug
// when fyStartMonth=9) so "jump to September" is the first button in the
// grid rather than buried 9 rows down a Jan-Dec list — see docs/decisions-log.md.
function fyOrderedMonths(fyStartMonth) {
  const start = ((Number(fyStartMonth) - 1) % 12 + 12) % 12
  return Array.from({ length: 12 }, (_, i) => (start + i) % 12)
}

function buildYearRange(centreYear) {
  const start = centreYear - YEAR_RANGE_SPAN
  return Array.from({ length: YEAR_RANGE_SPAN * 2 + 1 }, (_, i) => start + i)
}

const TODAY = new Date()

/**
 * DD/MM/YYYY text field + popup calendar. Drop-in replacement for
 * `<input type="date">`: `value`/`onChange` both use plain 'YYYY-MM-DD'
 * strings (or '' for empty), so callers don't need an `e.target.value`
 * unwrap — `onChange` is called directly with the new iso string.
 *
 * Built custom rather than pulling in a dependency (see docs/decisions-log.md
 * for why) because the one thing every off-the-shelf option got wrong for
 * this app was slow decade-spanning navigation: clicking a month header
 * shows a 12-month grid, clicking the year shows a scrollable year grid, so
 * jumping to e.g. September 2023 is two short taps instead of 24 "previous
 * month" clicks.
 */
export default function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  fyStartMonth = 9,
  required = false,
  disabled = false,
}) {
  const [text, setText] = useState(() => formatDisplay(value))
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('days') // 'days' | 'months' | 'years'
  const [dropUp, setDropUp] = useState(false)
  const [dropRight, setDropRight] = useState(false)

  const initial = parseIso(value) || { year: TODAY.getFullYear(), month: TODAY.getMonth() }
  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)

  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Keep the text field in sync whenever the value changes from outside
  // (a parent resetting the form, a "Clear filters" button, etc).
  useEffect(() => {
    setText(formatDisplay(value))
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setView('days')
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setView('days')
        inputRef.current?.blur()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const openCalendar = () => {
    if (disabled || open) return
    const parsed = parseIso(value)
    setViewYear(parsed ? parsed.year : TODAY.getFullYear())
    setViewMonth(parsed ? parsed.month : TODAY.getMonth())
    setView('days')
    setOpen(true)
    requestAnimationFrame(() => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const estimatedHeight = 360
      const estimatedWidth = 300
      setDropUp(rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight)
      setDropRight(rect.left + estimatedWidth > window.innerWidth)
    })
  }

  const commitIso = (iso) => {
    onChange(iso)
    setText(formatDisplay(iso))
  }

  const handleTextChange = (e) => {
    const raw = e.target.value
    const cursorPos = e.target.selectionStart ?? raw.length
    const digitCount = digitsBeforeCursor(raw, cursorPos)
    const formatted = autoSlash(raw)
    setText(formatted)

    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = cursorForDigitCount(digitCount)
      el.setSelectionRange(pos, pos)
    })

    if (formatted === '') {
      onChange('')
      return
    }
    const iso = parseTyped(formatted)
    if (iso) {
      onChange(iso)
      const parsed = parseIso(iso)
      setViewYear(parsed.year)
      setViewMonth(parsed.month)
    }
  }

  const handleTextBlur = () => {
    // Whatever's half-typed and invalid reverts to the last committed value.
    setText(formatDisplay(value))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && open) {
      e.preventDefault()
      setOpen(false)
      setView('days')
      inputRef.current?.blur()
    }
  }

  const handleDayClick = (year, month, day) => {
    commitIso(isoFrom(year, month, day))
    setOpen(false)
    setView('days')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange('')
    setText('')
    inputRef.current?.focus()
  }

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const selected = parseIso(value)
  const days = buildDayGrid(viewYear, viewMonth)
  const monthOrder = fyOrderedMonths(fyStartMonth)
  const yearRange = buildYearRange(viewYear)

  const dropdownClass = [
    'kt-datepicker-dropdown',
    dropUp ? 'kt-datepicker-dropdown-up' : '',
    dropRight ? 'kt-datepicker-dropdown-right' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={`kt-datepicker${disabled ? ' kt-datepicker-disabled' : ''}`} ref={containerRef}>
      <div className="kt-datepicker-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="kt-datepicker-input"
          placeholder={placeholder}
          value={text}
          onChange={handleTextChange}
          onFocus={openCalendar}
          onClick={openCalendar}
          onBlur={handleTextBlur}
          onKeyDown={handleKeyDown}
          required={required}
          disabled={disabled}
        />
        {value && (
          <button
            type="button"
            className="kt-datepicker-clear"
            onClick={handleClear}
            aria-label="Clear date"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div className={dropdownClass}>
          {view === 'days' && (
            <>
              <div className="kt-datepicker-header">
                <button type="button" className="kt-datepicker-nav" onClick={goPrevMonth} aria-label="Previous month">
                  ‹
                </button>
                <div className="kt-datepicker-header-labels">
                  <button type="button" className="kt-datepicker-header-btn" onClick={() => setView('months')}>
                    {MONTH_NAMES[viewMonth]}
                  </button>
                  <button type="button" className="kt-datepicker-header-btn" onClick={() => setView('years')}>
                    {viewYear}
                  </button>
                </div>
                <button type="button" className="kt-datepicker-nav" onClick={goNextMonth} aria-label="Next month">
                  ›
                </button>
              </div>

              <div className="kt-datepicker-weekdays" aria-hidden="true">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="kt-datepicker-days">
                {days.map(({ year, month, day, inCurrentMonth }) => {
                  const isSelected = !!selected && selected.year === year && selected.month === month && selected.day === day
                  const isToday = year === TODAY.getFullYear() && month === TODAY.getMonth() && day === TODAY.getDate()
                  return (
                    <button
                      key={`${year}-${month}-${day}`}
                      type="button"
                      className={[
                        'kt-datepicker-day',
                        inCurrentMonth ? '' : 'kt-datepicker-day-muted',
                        isSelected ? 'kt-datepicker-day-selected' : '',
                        isToday ? 'kt-datepicker-day-today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => handleDayClick(year, month, day)}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {view === 'months' && (
            <>
              <div className="kt-datepicker-header">
                <span className="kt-datepicker-nav-spacer" />
                <button type="button" className="kt-datepicker-header-btn" onClick={() => setView('years')}>
                  {viewYear}
                </button>
                <span className="kt-datepicker-nav-spacer" />
              </div>
              <div className="kt-datepicker-grid kt-datepicker-months">
                {monthOrder.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`kt-datepicker-grid-btn${m === viewMonth ? ' kt-datepicker-grid-btn-active' : ''}`}
                    onClick={() => {
                      setViewMonth(m)
                      setView('days')
                    }}
                  >
                    {MONTH_ABBR[m]}
                  </button>
                ))}
              </div>
            </>
          )}

          {view === 'years' && (
            <>
              <div className="kt-datepicker-header">
                <button
                  type="button"
                  className="kt-datepicker-nav"
                  onClick={() => setViewYear((y) => y - (YEAR_RANGE_SPAN * 2 + 1))}
                  aria-label="Earlier years"
                >
                  ‹
                </button>
                <span className="kt-datepicker-header-static">
                  {yearRange[0]}–{yearRange[yearRange.length - 1]}
                </span>
                <button
                  type="button"
                  className="kt-datepicker-nav"
                  onClick={() => setViewYear((y) => y + (YEAR_RANGE_SPAN * 2 + 1))}
                  aria-label="Later years"
                >
                  ›
                </button>
              </div>
              <div className="kt-datepicker-grid kt-datepicker-years">
                {yearRange.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`kt-datepicker-grid-btn${y === viewYear ? ' kt-datepicker-grid-btn-active' : ''}`}
                    onClick={() => {
                      setViewYear(y)
                      setView('days')
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="kt-datepicker-footer">
            <button
              type="button"
              className="kt-datepicker-today-btn"
              onClick={() => handleDayClick(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())}
            >
              Today
            </button>
            <button type="button" className="kt-datepicker-clear-btn" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
