import { useMemo, useRef, useState } from 'react'
import { formatCurrencyCompact, formatCurrency } from '../utils/format.js'

const COLOURS = {
  income: '#2D6B9F',
  spend: '#1D9E75',
  forecast: '#C97A0C',
  project: '#7C5CBF',
}

const WIDTH = 720
const HEIGHT = 320
const MARGIN = { top: 16, right: 16, bottom: 32, left: 64 }
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

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

export default function FinancialChart({ months, onSeriesClick }) {
  const svgRef = useRef(null)
  const [hoverIndex, setHoverIndex] = useState(null)

  const hasData = months.some(
    (m) => m.actual_spend > 0 || m.actual_income > 0 || m.forecast_spend > 0
  )

  const maxValue = useMemo(() => {
    const values = months.flatMap((m) => [m.actual_spend, m.actual_income, m.forecast_spend])
    const max = Math.max(0, ...values)
    return max > 0 ? max * 1.15 : 100
  }, [months])

  const xFor = (i) => MARGIN.left + (i / Math.max(months.length - 1, 1)) * INNER_WIDTH
  const yFor = (v) => MARGIN.top + INNER_HEIGHT - (v / maxValue) * INNER_HEIGHT
  const baselineY = yFor(0)

  const incomePoints = months.map((m, i) => ({ x: xFor(i), y: yFor(m.actual_income), value: m.actual_income }))
  const spendPoints = months.map((m, i) => ({ x: xFor(i), y: yFor(m.actual_spend), value: m.actual_spend }))
  const forecastPoints = months.map((m, i) => ({ x: xFor(i), y: yFor(m.forecast_spend), value: m.forecast_spend }))

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f))

  function nearestIndexFromEvent(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = WIDTH / rect.width
    const relX = (e.clientX - rect.left) * scaleX
    const ratio = (relX - MARGIN.left) / INNER_WIDTH
    const idx = Math.round(ratio * (months.length - 1))
    return Math.min(Math.max(idx, 0), months.length - 1)
  }

  function handleMove(e) {
    setHoverIndex(nearestIndexFromEvent(e))
  }

  function handleClick(e) {
    const idx = nearestIndexFromEvent(e)
    const rect = svgRef.current.getBoundingClientRect()
    const scaleY = HEIGHT / rect.height
    const relY = (e.clientY - rect.top) * scaleY

    const distances = {
      income: Math.abs(relY - incomePoints[idx].y),
      spend: Math.abs(relY - spendPoints[idx].y),
      forecast: Math.abs(relY - forecastPoints[idx].y),
    }
    const series = Object.keys(distances).reduce((a, b) => (distances[a] <= distances[b] ? a : b))
    onSeriesClick?.(series)
  }

  const hovered = hoverIndex !== null ? months[hoverIndex] : null
  const tooltipX = hoverIndex !== null ? xFor(hoverIndex) : 0
  const tooltipFlip = tooltipX > WIDTH - 180

  return (
    <div className="kt-chart-wrap">
      <div className="kt-chart-legend">
        <button type="button" className="kt-chart-legend-item" onClick={() => onSeriesClick?.('income')}>
          <span className="kt-chart-swatch" style={{ background: COLOURS.income }} />
          Income
        </button>
        <button type="button" className="kt-chart-legend-item" onClick={() => onSeriesClick?.('spend')}>
          <span className="kt-chart-swatch" style={{ background: COLOURS.spend }} />
          Actual spend
        </button>
        <button type="button" className="kt-chart-legend-item" onClick={() => onSeriesClick?.('forecast')}>
          <span className="kt-chart-swatch" style={{ background: COLOURS.forecast }} />
          Forecast spend
        </button>
        <span className="kt-chart-legend-item kt-chart-legend-static">
          <span className="kt-chart-swatch" style={{ background: COLOURS.project }} />
          Planned project
        </span>
      </div>

      {!hasData ? (
        <div className="kt-dashboard-empty">
          Nothing to chart yet — once invoices and contributions start coming in
          for this financial year, they'll appear here.
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="kt-chart-svg"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          onClick={handleClick}
          role="img"
          aria-label="Financial year chart: income, actual spend, and forecast spend by month"
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

          <path d={buildAreaPath(incomePoints, baselineY)} fill={COLOURS.income} opacity="0.12" />
          <path d={buildAreaPath(spendPoints, baselineY)} fill={COLOURS.spend} opacity="0.14" />

          <path d={buildLinePath(incomePoints)} fill="none" stroke={COLOURS.income} strokeWidth="2" />
          <path d={buildLinePath(spendPoints)} fill="none" stroke={COLOURS.spend} strokeWidth="2" />
          <path
            d={buildLinePath(forecastPoints)}
            fill="none"
            stroke={COLOURS.forecast}
            strokeWidth="2"
            strokeDasharray="6 4"
          />

          {months.map((m, i) =>
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
              <circle cx={incomePoints[hoverIndex].x} cy={incomePoints[hoverIndex].y} r="4" fill={COLOURS.income} />
              <circle cx={spendPoints[hoverIndex].x} cy={spendPoints[hoverIndex].y} r="4" fill={COLOURS.spend} />
              <circle cx={forecastPoints[hoverIndex].x} cy={forecastPoints[hoverIndex].y} r="4" fill={COLOURS.forecast} />
            </>
          )}
        </svg>
      )}

      {hovered && (
        <div
          className="kt-chart-tooltip"
          style={{
            left: `${(tooltipFlip ? tooltipX - 170 : tooltipX + 12) / WIDTH * 100}%`,
            top: `${(MARGIN.top + 4) / HEIGHT * 100}%`,
          }}
        >
          <strong>{hovered.month_label}</strong>
          <div><span className="kt-chart-swatch" style={{ background: COLOURS.income }} /> Income: {formatCurrency(hovered.actual_income)}</div>
          <div><span className="kt-chart-swatch" style={{ background: COLOURS.spend }} /> Spend: {formatCurrency(hovered.actual_spend)}</div>
          <div><span className="kt-chart-swatch" style={{ background: COLOURS.forecast }} /> Forecast: {formatCurrency(hovered.forecast_spend)}</div>
          {hovered.planned_project_cost > 0 && (
            <div><span className="kt-chart-swatch" style={{ background: COLOURS.project }} /> Planned project: {formatCurrency(hovered.planned_project_cost)}</div>
          )}
        </div>
      )}
    </div>
  )
}
