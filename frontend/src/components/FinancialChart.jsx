import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCurrencyCompact, formatCurrency } from '../utils/format.js'

// income re-uses the app's primary blue, which lightens for dark mode
// (see theme.css) — spend/forecast/project are a fixed, colourblind-safe
// categorical set validated separately (see docs/decisions-log.md) and
// stay constant across themes. surplus/deficit/cumulative reuse the app's
// existing semantic accent/danger/muted tokens rather than adding new
// colours, so the cash flow bars read the same "good/bad" green/red as the
// rest of the dashboard (balance status pills, reserve gauge).
const COLOURS = {
  income: 'var(--kt-primary)',
  spend: '#1D9E75',
  forecast: '#C97A0C',
  project: '#7C5CBF',
  cumulative: 'var(--kt-text-muted)',
  surplus: 'var(--kt-accent)',
  surplusRgb: 'var(--kt-accent-rgb)',
  deficit: 'var(--kt-danger)',
  deficitRgb: 'var(--kt-danger-rgb)',
}

const WIDTH = 720
const HEIGHT = 220
const MARGIN = { top: 10, right: 16, bottom: 24, left: 64 }
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

// Cumulative balance is hidden by default (see docs/decisions-log.md), so a
// fresh chart never needs the bars/deficit legend items greyed out for no
// reason — everything else starts visible.
const DEFAULT_HIDDEN = { income: false, spend: false, forecast: false, cumulative: true, surplus: false, deficit: false }

function buildLinePath(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
}

function buildAreaPath(points, baselineY) {
  if (points.length === 0) return ''
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  return `${line} L${last.x},${baselineY} L${first.x},${baselineY} Z`
}

// Tracks a media query with a live listener rather than reading it once, so
// rotating a tablet or resizing a browser window updates the chart without
// needing a remount. See docs/decisions-log.md.
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

export default function FinancialChart({ months, onSeriesClick, period, onPeriodChange }) {
  const svgRef = useRef(null)
  const [hoverIndex, setHoverIndex] = useState(null)
  const [hidden, setHidden] = useState(DEFAULT_HIDDEN)

  // Mobile simplifies to income vs spend vs forecast lines only — bars and
  // the cumulative balance line drop out for readability at that width, and
  // a tap (rather than a hover) drives the tooltip. See docs/decisions-log.md.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const isTouch = useMediaQuery('(hover: none)')

  const showCumulative = !isMobile && !hidden.cumulative
  const showBars = !isMobile

  function toggleSeries(key) {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const hasData = months.some(
    (m) => Number(m.actual_spend) > 0 || Number(m.actual_income) > 0 || Number(m.forecast_spend) > 0
  )

  // Primary scale covers income/spend/forecast (always shown) plus the
  // cumulative balance line only while it's actually visible — so toggling
  // it off snaps the axis straight back to the tighter, more legible range
  // the other three lines need. Includes 0 in the domain unconditionally,
  // and extends below it when a balance genuinely runs into deficit, rather
  // than assuming every value is non-negative like the previous version did.
  const { yMin, yMax } = useMemo(() => {
    const values = months.flatMap((m) => [
      Number(m.actual_spend),
      Number(m.actual_income),
      Number(m.forecast_spend),
      ...(showCumulative ? [Number(m.cumulative_balance)] : []),
    ])
    const domainMin = Math.min(0, ...values)
    const domainMax = Math.max(0, ...values)
    const pad = (domainMax - domainMin) * 0.15 || 100
    return {
      yMin: domainMin < 0 ? domainMin - pad : 0,
      yMax: domainMax + pad,
    }
  }, [months, showCumulative])

  const xFor = (i) => MARGIN.left + (i / Math.max(months.length - 1, 1)) * INNER_WIDTH
  const yFor = (v) => MARGIN.top + INNER_HEIGHT - ((v - yMin) / (yMax - yMin || 1)) * INNER_HEIGHT
  const baselineY = yFor(0)

  const incomePoints = months.map((m, i) => ({ x: xFor(i), y: yFor(Number(m.actual_income)), value: m.actual_income }))
  const spendPoints = months.map((m, i) => ({ x: xFor(i), y: yFor(Number(m.actual_spend)), value: m.actual_spend }))
  const forecastPoints = months.map((m, i) => ({ x: xFor(i), y: yFor(Number(m.forecast_spend)), value: m.forecast_spend }))
  const cumulativePoints = months.map((m, i) => ({ x: xFor(i), y: yFor(Number(m.cumulative_balance)), value: m.cumulative_balance }))

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMin + (yMax - yMin) * f))

  // Net cash flow bars use their own independent scale (this chart's "dual
  // axis") rather than sharing the lines' pound scale — a bar's height is
  // meant to read as "how big was this month's surplus/deficit relative to
  // other months", not get dwarfed by income/spend totals that are usually
  // an order of magnitude larger. Bars grow from a fixed mid-height zero
  // line, up (surplus) or down (deficit), so both directions always have
  // equal room regardless of whether the balance line ever dips negative.
  // See docs/decisions-log.md.
  const barBaselineY = MARGIN.top + INNER_HEIGHT * 0.5
  const barSpan = INNER_HEIGHT * 0.46
  const barMaxAbs = Math.max(1, ...months.map((m) => Math.abs(Number(m.net_cashflow) || 0)))
  const barWidth = Math.min(22, (INNER_WIDTH / Math.max(months.length - 1, 1)) * 0.55)

  function nearestIndexFromEvent(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = WIDTH / rect.width
    const relX = (e.clientX - rect.left) * scaleX
    const ratio = (relX - MARGIN.left) / INNER_WIDTH
    const idx = Math.round(ratio * (months.length - 1))
    return Math.min(Math.max(idx, 0), months.length - 1)
  }

  function handleMove(e) {
    if (isTouch) return
    setHoverIndex(nearestIndexFromEvent(e))
  }

  function handleActivate(e) {
    const idx = nearestIndexFromEvent(e)

    // A tap on mobile/touch shows (or dismisses, on a repeat tap of the same
    // month) the rich tooltip instead of navigating away — there's no hover
    // to preview the detail page link first, so leaving the first tap free
    // for inspection matches how every other tap-driven chart on a touch
    // device behaves. See docs/decisions-log.md.
    if (isTouch) {
      setHoverIndex((prev) => (prev === idx ? null : idx))
      return
    }

    const rect = svgRef.current.getBoundingClientRect()
    const scaleY = HEIGHT / rect.height
    const relY = (e.clientY - rect.top) * scaleY

    const candidates = {
      income: hidden.income ? null : Math.abs(relY - incomePoints[idx].y),
      spend: hidden.spend ? null : Math.abs(relY - spendPoints[idx].y),
      forecast: hidden.forecast ? null : Math.abs(relY - forecastPoints[idx].y),
    }
    const visible = Object.entries(candidates).filter(([, d]) => d !== null)
    if (visible.length === 0) return
    const series = visible.reduce((a, b) => (a[1] <= b[1] ? a : b))[0]
    onSeriesClick?.(series)
  }

  const hovered = hoverIndex !== null ? months[hoverIndex] : null
  const tooltipX = hoverIndex !== null ? xFor(hoverIndex) : 0
  const tooltipFlip = tooltipX > WIDTH - 190
  const netValue = hovered ? Number(hovered.net_cashflow) || 0 : 0

  const legend = (
    <div className="kt-chart-legend">
      <button
        type="button"
        className={`kt-chart-legend-item${hidden.income ? ' kt-chart-legend-hidden' : ''}`}
        aria-pressed={!hidden.income}
        onClick={() => toggleSeries('income')}
      >
        <span className="kt-chart-swatch" style={{ background: COLOURS.income }} />
        Income
      </button>
      <button
        type="button"
        className={`kt-chart-legend-item${hidden.spend ? ' kt-chart-legend-hidden' : ''}`}
        aria-pressed={!hidden.spend}
        onClick={() => toggleSeries('spend')}
      >
        <span className="kt-chart-swatch" style={{ background: COLOURS.spend }} />
        Actual spend
      </button>
      <button
        type="button"
        className={`kt-chart-legend-item${hidden.forecast ? ' kt-chart-legend-hidden' : ''}`}
        aria-pressed={!hidden.forecast}
        onClick={() => toggleSeries('forecast')}
      >
        <span className="kt-chart-swatch" style={{ background: COLOURS.forecast }} />
        Forecast spend
      </button>
      {showBars && (
        <>
          <button
            type="button"
            className={`kt-chart-legend-item${hidden.surplus ? ' kt-chart-legend-hidden' : ''}`}
            aria-pressed={!hidden.surplus}
            onClick={() => toggleSeries('surplus')}
          >
            <span className="kt-chart-swatch" style={{ background: COLOURS.surplus }} />
            Surplus month
          </button>
          <button
            type="button"
            className={`kt-chart-legend-item${hidden.deficit ? ' kt-chart-legend-hidden' : ''}`}
            aria-pressed={!hidden.deficit}
            onClick={() => toggleSeries('deficit')}
          >
            <span className="kt-chart-swatch" style={{ background: COLOURS.deficit }} />
            Deficit month
          </button>
          <button
            type="button"
            className={`kt-chart-legend-item${hidden.cumulative ? ' kt-chart-legend-hidden' : ''}`}
            aria-pressed={!hidden.cumulative}
            onClick={() => toggleSeries('cumulative')}
          >
            <span
              className="kt-chart-swatch"
              style={{ backgroundImage: `repeating-linear-gradient(90deg, ${COLOURS.cumulative} 0 4px, transparent 4px 7px)` }}
            />
            Running balance
          </button>
        </>
      )}
      <span className="kt-chart-legend-item kt-chart-legend-static">
        <span className="kt-chart-swatch" style={{ background: COLOURS.project }} />
        Planned project
      </span>
    </div>
  )

  return (
    <div className="kt-chart-wrap">
      <div className="kt-chart-toolbar">
        {!isMobile && legend}
        {onPeriodChange && (
          <div className="kt-chart-period-toggle" role="group" aria-label="Chart period">
            <button
              type="button"
              className={`kt-chart-period-btn${period !== 'previous' ? ' active' : ''}`}
              onClick={() => onPeriodChange('current')}
            >
              This year
            </button>
            <button
              type="button"
              className={`kt-chart-period-btn${period === 'previous' ? ' active' : ''}`}
              onClick={() => onPeriodChange('previous')}
            >
              Last year
            </button>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="kt-dashboard-empty">
          {period === 'previous'
            ? "Nothing to chart for last year — there's no tracked activity in that financial year."
            : "Nothing to chart yet — once invoices and contributions start coming in for this financial year, they'll appear here."}
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="kt-chart-svg"
          onMouseMove={handleMove}
          onMouseLeave={() => !isTouch && setHoverIndex(null)}
          onClick={handleActivate}
          role="img"
          aria-label="Financial year chart: income, actual spend, forecast spend, and net cash flow by month"
        >
          {gridTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke="var(--kt-border)"
                strokeWidth="1"
              />
              <text x={MARGIN.left - 8} y={yFor(tick) + 4} textAnchor="end" className="kt-chart-axis-label">
                {formatCurrencyCompact(tick)}
              </text>
            </g>
          ))}

          {months.map((m, i) => (
            <text
              key={m.month_label}
              x={xFor(i)}
              y={HEIGHT - MARGIN.bottom + 20}
              textAnchor="middle"
              className="kt-chart-axis-label"
            >
              {m.month_label.slice(0, 3)}
            </text>
          ))}

          {/* Net cash flow bars render first (and semi-transparent) so the
              income/spend/forecast lines stay legible on top of them. */}
          {showBars &&
            months.map((m, i) => {
              const netVal = Number(m.net_cashflow) || 0
              if (netVal === 0) return null
              const isSurplus = netVal > 0
              if (isSurplus && hidden.surplus) return null
              if (!isSurplus && hidden.deficit) return null
              const barHeight = (Math.abs(netVal) / barMaxAbs) * barSpan
              const barY = isSurplus ? barBaselineY - barHeight : barBaselineY
              return (
                <rect
                  key={`bar-${m.month_label}`}
                  x={xFor(i) - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={isSurplus ? `rgba(${COLOURS.surplusRgb}, 0.28)` : `rgba(${COLOURS.deficitRgb}, 0.28)`}
                />
              )
            })}
          {showBars && (
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={barBaselineY}
              y2={barBaselineY}
              stroke="var(--kt-border)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          )}

          {!hidden.income && <path d={buildAreaPath(incomePoints, baselineY)} fill={COLOURS.income} opacity="0.12" />}
          {!hidden.spend && <path d={buildAreaPath(spendPoints, baselineY)} fill={COLOURS.spend} opacity="0.14" />}

          {!hidden.income && <path d={buildLinePath(incomePoints)} fill="none" stroke={COLOURS.income} strokeWidth="2" />}
          {!hidden.spend && <path d={buildLinePath(spendPoints)} fill="none" stroke={COLOURS.spend} strokeWidth="2" />}
          {!hidden.forecast && (
            <path
              d={buildLinePath(forecastPoints)}
              fill="none"
              stroke={COLOURS.forecast}
              strokeWidth="2"
              strokeDasharray="6 4"
            />
          )}
          {showCumulative && (
            <path
              d={buildLinePath(cumulativePoints)}
              fill="none"
              stroke={COLOURS.cumulative}
              strokeWidth="2"
              strokeDasharray="3 3"
            />
          )}

          {!hidden.forecast &&
            months.map((m, i) =>
              m.planned_project_cost > 0 ? (
                <circle
                  key={`project-${m.month_label}`}
                  cx={forecastPoints[i].x}
                  cy={forecastPoints[i].y}
                  r="6"
                  fill={COLOURS.project}
                  stroke="var(--kt-surface)"
                  strokeWidth="2"
                />
              ) : null
            )}

          {hoverIndex !== null && (
            <>
              <line
                x1={xFor(hoverIndex)}
                x2={xFor(hoverIndex)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                stroke="var(--kt-text)"
                strokeOpacity="0.15"
                strokeWidth="1"
              />
              {!hidden.income && <circle cx={incomePoints[hoverIndex].x} cy={incomePoints[hoverIndex].y} r="4" fill={COLOURS.income} />}
              {!hidden.spend && <circle cx={spendPoints[hoverIndex].x} cy={spendPoints[hoverIndex].y} r="4" fill={COLOURS.spend} />}
              {!hidden.forecast && <circle cx={forecastPoints[hoverIndex].x} cy={forecastPoints[hoverIndex].y} r="4" fill={COLOURS.forecast} />}
              {showCumulative && <circle cx={cumulativePoints[hoverIndex].x} cy={cumulativePoints[hoverIndex].y} r="4" fill={COLOURS.cumulative} />}
            </>
          )}
        </svg>
      )}

      {isMobile && legend}

      {hovered && (
        <div
          className="kt-chart-tooltip"
          style={{
            left: `${(tooltipFlip ? tooltipX - 180 : tooltipX + 12) / WIDTH * 100}%`,
            top: `${(MARGIN.top + 4) / HEIGHT * 100}%`,
          }}
        >
          <strong>{hovered.month_label}</strong>

          <div><span className="kt-chart-swatch" style={{ background: COLOURS.income }} /> Income: {formatCurrency(hovered.actual_income)}</div>
          {hovered.income_breakdown?.length > 0 && (
            <ul className="kt-chart-tooltip-breakdown">
              {hovered.income_breakdown.map((b) => (
                <li key={b.group_name}>{b.group_name}: {formatCurrency(b.amount)}</li>
              ))}
            </ul>
          )}

          <div><span className="kt-chart-swatch" style={{ background: COLOURS.spend }} /> Expenses: {formatCurrency(hovered.actual_spend)}</div>
          {hovered.spend_breakdown?.length > 0 && (
            <ul className="kt-chart-tooltip-breakdown">
              {hovered.spend_breakdown.map((b) => (
                <li key={b.category_name}>{b.category_name}: {formatCurrency(b.amount)}</li>
              ))}
            </ul>
          )}

          <div className="kt-chart-tooltip-net">
            <span className="kt-chart-swatch" style={{ background: netValue >= 0 ? COLOURS.surplus : COLOURS.deficit }} />
            Net: {netValue >= 0 ? '+' : '−'}{formatCurrency(Math.abs(netValue))}
          </div>
          <div>Balance: {formatCurrency(hovered.cumulative_balance)}</div>

          {!hovered.is_elapsed && (
            <div><span className="kt-chart-swatch" style={{ background: COLOURS.forecast }} /> Forecast: {formatCurrency(hovered.forecast_spend)} expected</div>
          )}
          {hovered.planned_project_cost > 0 && (
            <div><span className="kt-chart-swatch" style={{ background: COLOURS.project }} /> Planned project: {formatCurrency(hovered.planned_project_cost)}</div>
          )}
        </div>
      )}
    </div>
  )
}
