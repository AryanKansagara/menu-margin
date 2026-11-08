import type { EngRow } from './engine/engineering.ts'
import { QUADRANT } from './engine/engineering.ts'
import { money, pct } from './ui.tsx'

export interface MatrixProps {
  rows: EngRow[]
  avgCm: number
  popThreshold: number
  highlight?: string | null
  ghost?: { x: number; y: number } | null // previous position of highlighted item (mix %, CM)
  onSelect?: (id: string) => void
  domain?: { xMax: number; yMin: number; yMax: number }
  height?: number
  labels?: 'all' | 'highlight' | 'none'
  compact?: boolean
  width?: number
}

/** Piecewise-linear scale that puts the threshold at the centre so all four quadrants get equal area. */
function split(v: number, lo: number, mid: number, hi: number) {
  if (v <= mid) return mid > lo ? 0.5 * ((v - lo) / (mid - lo)) : 0.5
  return hi > mid ? 0.5 + 0.5 * Math.min(1, (v - mid) / (hi - mid)) : 0.5
}

export function Matrix({ rows, avgCm, popThreshold, highlight, ghost, onSelect, domain, height = 420, labels = 'all', compact, width = 640 }: MatrixProps) {
  const W = width
  const H = height
  const pad = compact ? { l: 28, r: 14, t: 14, b: 28 } : { l: 46, r: 18, t: 18, b: 42 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const xMax = domain?.xMax ?? Math.max(popThreshold * 2, ...rows.map((r) => r.mixPct)) * 1.08
  const cms = rows.map((r) => r.cm)
  const yMin = domain?.yMin ?? Math.min(avgCm * 0.4, ...cms) - 1
  const yMax = domain?.yMax ?? Math.max(avgCm * 1.6, ...cms) + 1
  const X = (v: number) => pad.l + iw * Math.max(0, Math.min(1, split(v, 0, popThreshold, xMax)))
  const Y = (v: number) => pad.t + ih * (1 - Math.max(0, Math.min(1, split(v, yMin, avgCm, yMax))))
  const maxQty = Math.max(1, ...rows.map((r) => r.qty))
  const R = (q: number) => (compact ? 5 : 6) + Math.sqrt(q / maxQty) * (compact ? 9 : 13)
  const cx = pad.l + iw / 2
  const cy = pad.t + ih / 2
  const quads = [
    { q: 'puzzle', x: pad.l, y: pad.t },
    { q: 'star', x: cx, y: pad.t },
    { q: 'dog', x: pad.l, y: cy },
    { q: 'plowhorse', x: cx, y: cy },
  ] as const
  const sorted = [...rows].sort((a, b) => (a.id === highlight ? 1 : b.id === highlight ? -1 : b.qty - a.qty))
  // Greedy label placement: highlighted first, then by volume; try right then left, skip if it would overlap.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const side = new Map<string, 'r' | 'l' | null>()
  const hit = (b: { x0: number; x1: number; y0: number; y1: number }) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)
  for (const { x, y } of quads) placed.push({ x0: x, x1: x + 90, y0: y, y1: y + 30 })
  for (const r of rows) placed.push({ x0: X(r.mixPct) - R(r.qty), x1: X(r.mixPct) + R(r.qty), y0: Y(r.cm) - R(r.qty), y1: Y(r.cm) + R(r.qty) })
  const order = [...rows].sort((a, b) => (a.id === highlight ? -1 : b.id === highlight ? 1 : b.qty - a.qty))
  for (const r of order) {
    const show = labels === 'all' || (labels === 'highlight' && r.id === highlight)
    if (!show) { side.set(r.id, null); continue }
    const x = X(r.mixPct), y = Y(r.cm), rr = R(r.qty), w = r.name.length * (r.id === highlight ? 7.6 : 6.4) + 4
    const right = { x0: x + rr + 4, x1: x + rr + 4 + w, y0: y - 8, y1: y + 8 }
    const left = { x0: x - rr - 4 - w, x1: x - rr - 4, y0: y - 8, y1: y + 8 }
    const fitsR = right.x1 <= W && !hit(right)
    const fitsL = left.x0 >= 0 && !hit(left)
    const pick = fitsR ? 'r' : fitsL ? 'l' : r.id === highlight ? (right.x1 <= W ? 'r' : 'l') : null
    side.set(r.id, pick)
    if (pick) placed.push(pick === 'r' ? right : left)
  }
  return (
    <svg className={`matrix ${compact ? 'matrix-compact' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Menu engineering matrix: popularity against contribution margin">
      {quads.map(({ q, x, y }) => (
        <g key={q}>
          <rect x={x} y={y} width={iw / 2} height={ih / 2} className={`mq mq-${q}`} rx={compact ? 8 : 12} />
          
        </g>
      ))}
      <line x1={cx} x2={cx} y1={pad.t} y2={pad.t + ih} className="mq-axis" />
      <line x1={pad.l} x2={pad.l + iw} y1={cy} y2={cy} className="mq-axis" />
      {!compact && (
        <>
          <text x={cx} y={H - 12} textAnchor="middle" className="mq-tick">Popularity · threshold {pct(popThreshold)} of mix</text>
          <text x={14} y={cy} textAnchor="middle" className="mq-tick" transform={`rotate(-90 14 ${cy})`}>CM · avg {money(avgCm)}</text>
          <text x={pad.l} y={H - 12} className="mq-tick">less ordered</text>
          <text x={W - pad.r} y={H - 12} textAnchor="end" className="mq-tick">more ordered</text>
        </>
      )}
      {ghost && highlight && (
        <g className="mq-ghost">
          <circle cx={X(ghost.x)} cy={Y(ghost.y)} r={compact ? 7 : 9} />
          {(() => { const h = rows.find((r) => r.id === highlight); return h ? <line x1={X(ghost.x)} y1={Y(ghost.y)} x2={X(h.mixPct)} y2={Y(h.cm)} /> : null })()}
        </g>
      )}
      {sorted.map((r) => {
        const on = r.id === highlight
        const sd = side.get(r.id)
        const showLabel = !!sd
        const x = X(r.mixPct)
        const y = Y(r.cm)
        const right = sd === 'r'
        return (
          <g key={r.id} className={`dot q-${r.quadrant} ${on ? 'dot-on' : ''} ${highlight && !on ? 'dot-dim' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={onSelect ? () => onSelect(r.id) : undefined} tabIndex={onSelect ? 0 : undefined} role={onSelect ? 'button' : undefined}
            onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id) } } : undefined}
            aria-label={`${r.name}: ${QUADRANT[r.quadrant].label}, ${pct(r.mixPct)} of mix, ${money(r.cm)} margin`}>
            <circle r={R(r.qty)} />
            {showLabel && <text x={right ? R(r.qty) + 6 : -R(r.qty) - 6} y={4} textAnchor={right ? 'start' : 'end'} className="dot-label">{r.name}</text>}
            <title>{`${r.name}\n${QUADRANT[r.quadrant].label} · ${pct(r.mixPct)} mix · CM ${money(r.cm)} · FC ${pct(r.fcPct)}`}</title>
          </g>
        )
      })}
      {quads.map(({ q, x, y }) => <text key={q} x={x + 12} y={y + (compact ? 20 : 24)} className="mq-label">{QUADRANT[q].label}</text>)}
    </svg>
  )
}

export function Sparkline({ values, width = 120, height = 32, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <svg width={width} height={height} className={`spark ${className ?? ''}`} aria-hidden="true"><line x1={0} x2={width} y1={height / 2} y2={height / 2} /></svg>
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const p = (v: number, i: number) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)}`
  const up = values[values.length - 1] > values[0]
  return (
    <svg width={width} height={height} className={`spark ${up ? 'spark-up' : 'spark-down'} ${className ?? ''}`} aria-hidden="true">
      <polyline points={values.map(p).join(' ')} />
      <circle cx={(width - 4) + 2} cy={height - 3 - ((values[values.length - 1] - lo) / (hi - lo || 1)) * (height - 6)} r={2.5} />
    </svg>
  )
}

const SEG = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']

export function CostBar({ parts, total }: { parts: { name: string; value: number }[]; total: number }) {
  const top = [...parts].sort((a, b) => b.value - a.value)
  const shown = top.slice(0, 5)
  const rest = top.slice(5).reduce((s, p) => s + p.value, 0)
  const all = rest > 0 ? [...shown, { name: 'Other', value: rest }] : shown
  return (
    <div className="costbar">
      <div className="costbar-track" role="img" aria-label="Cost breakdown">
        {all.map((p, i) => <span key={p.name} style={{ width: `${(p.value / (total || 1)) * 100}%`, background: SEG[i] }} title={`${p.name}: ${money(p.value)}`} />)}
      </div>
      <ul className="costbar-legend">
        {all.map((p, i) => (
          <li key={p.name}><i style={{ background: SEG[i] }} />{p.name}<b>{money(p.value)}</b><span className="muted">{pct((p.value / (total || 1)) * 100, 0)}</span></li>
        ))}
      </ul>
    </div>
  )
}

export function Bars({ rows, max, format }: { rows: { label: string; value: number; tone?: string }[]; max?: number; format: (n: number) => string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hb-label">{r.label}</span>
          <span className="hb-track"><span className={`hb-fill ${r.tone ?? ''}`} style={{ width: `${(Math.abs(r.value) / m) * 100}%` }} /></span>
          <span className="hb-val">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}
