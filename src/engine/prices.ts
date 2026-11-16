import { costMenu, type ItemCost } from './costing.ts'
import { findHeaderRow, norm, parseCsv, parseNumber, pickColumn, rankMatches } from './csv.ts'
import type { Ingredient, ProjectData } from './types.ts'
import { parseUnit } from './units.ts'

export interface PriceMapping {
  name: number
  code: number
  price: number
  supplier: number
  packQty: number
  packUnit: number
  size: number // -1 when absent; "5 LB" next to a Pack of 6 means 30 lb
  date: number
}

export interface PriceLine {
  line: number
  name: string
  code: string
  price: number
  supplier: string
  packQty?: number
  packUnit?: string
  date?: string
}

export interface PriceParse {
  headers: string[]
  mapping: PriceMapping
  lines: PriceLine[]
  issues: { line: number; message: string }[]
}

/**
 * Read foodservice pack notation: "6/5 LB", "4/1 GAL", "12/32 OZ", "2/5#", "6x2kg", "15 DZ", "36".
 * Returns the total quantity in one case and the unit text, if any.
 */
export function parsePack(raw: string | undefined): { qty: number; unit?: string } | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/,/g, '.')
  if (!s) return null
  const m = /^(?:(\d+(?:\.\d+)?)\s*[\/x×]\s*)?(\d+(?:\.\d+)?|\.\d+)\s*([a-z#][a-z .#]*)?$/.exec(s)
  if (!m) return null
  const unit = m[3]?.trim().replace(/\.$/, '').replace(/\s+(avg|av|approx)$/, '')
  if (unit && !parseUnit(unit)) return null
  const qty = (m[1] ? parseFloat(m[1]) : 1) * parseFloat(m[2])
  return qty > 0 ? { qty, unit: unit || undefined } : null
}

export function detectPriceColumns(rawHeaders: string[]): PriceMapping {
  // Distributor exports label prices "Case $" and "Split $".
  const headers = rawHeaders.map((h) => h.replace(/\$/g, ' price'))
  const name = pickColumn(headers, ['description', 'item description', 'product description', 'desc', 'product', 'item name', 'item', 'name'])
  const code = pickColumn(headers, ['item code', 'item number', 'item no', 'item', 'supc', 'sku', 'code', 'product code', 'product number', 'upc'], [name])
  const packQty = pickColumn(headers, ['pack size', 'pack qty', 'pack', 'qty per case', 'size'], [name, code])
  const size = pickColumn(headers, ['size', 'unit size', 'item size'], [name, code, packQty])
  return {
    name,
    code,
    price: pickColumn(headers, ['case price', 'unit price', 'price each', 'price', 'cost', 'amount', 'extended price'], [name, code]),
    supplier: pickColumn(headers, ['supplier', 'vendor', 'distributor']),
    packQty,
    packUnit: pickColumn(headers, ['pack unit', 'uom', 'unit of measure', 'unit'], [name, code, packQty, size]),
    size,
    date: pickColumn(headers, ['invoice date', 'price date', 'effective date', 'date']),
  }
}

export function parsePriceList(text: string, mapping?: PriceMapping): PriceParse {
  const all = parseCsv(text)
  const hr = findHeaderRow(all, ['description', 'price', 'item', 'sku', 'supplier', 'pack', 'uom', 'unit price'])
  const headers = all[hr] ?? []
  const m = { size: -1, ...(mapping ?? detectPriceColumns(headers)) }
  const issues: PriceParse['issues'] = []
  const lines: PriceLine[] = []
  if (m.name < 0 && m.code < 0) issues.push({ line: hr + 1, message: 'Map a description or item-code column' })
  if (m.price < 0) issues.push({ line: hr + 1, message: 'Map a price column' })
  if (issues.length) return { headers, mapping: m, lines, issues }
  all.slice(hr + 1).forEach((r, i) => {
    const line = hr + 2 + i
    const name = m.name >= 0 ? r[m.name] ?? '' : ''
    const code = m.code >= 0 ? r[m.code] ?? '' : ''
    if (!name && !code) return
    if (/^(sub)?total|^tax|^freight|^delivery/i.test(name)) return
    const price = parseNumber(r[m.price])
    if (!Number.isFinite(price) || price < 0) { issues.push({ line, message: `Price "${r[m.price] ?? ''}" for "${name || code}" is not a number` }); return }
    const pack = m.packQty >= 0 ? parsePack(r[m.packQty]) : null
    const size = m.size >= 0 ? parsePack(r[m.size]) : null
    const packQty = pack && size ? pack.qty * size.qty : (pack ?? size)?.qty
    // A UOM column often says "CS" (case); fall back to the unit inside the pack text.
    const units = [m.packUnit >= 0 ? r[m.packUnit] : '', size?.unit, pack?.unit].filter((u): u is string => !!u)
    const unitText = units.find((u) => parseUnit(u)) ?? units[0]
    lines.push({
      line, name, code, price,
      supplier: m.supplier >= 0 ? r[m.supplier] ?? '' : '',
      packQty,
      packUnit: unitText || undefined,
      date: m.date >= 0 ? r[m.date] || undefined : undefined,
    })
  })
  return { headers, mapping: m, lines, issues }
}

export type DiffKind = 'up' | 'down' | 'same' | 'new' | 'pack'

export interface DiffRow {
  line: PriceLine
  ingredientId: string | null
  matchScore: number
  kind: DiffKind
  old?: number
  next?: number
  pct?: number
  note?: string
}

export interface PriceDiff {
  rows: DiffRow[]
  missing: Ingredient[] // ingredients from this supplier absent from the file
}

/** Compare a price list against current ingredients. Matches by supplier code, then exact name, then fuzzy name. */
export function diffPrices(ingredients: Ingredient[], lines: PriceLine[], overrides: Record<number, string | null> = {}): PriceDiff {
  const byCode = new Map(ingredients.filter((i) => i.code).map((i) => [norm(i.code!), i]))
  const byName = new Map(ingredients.map((i) => [norm(i.name), i]))
  const opts = ingredients.map((i) => ({ id: i.id, names: [i.name] }))
  const ingById = new Map(ingredients.map((i) => [i.id, i]))
  const used = new Set<string>()
  const rows = lines.map((l): DiffRow => {
    let ing: Ingredient | undefined
    let score = 1
    if (l.line in overrides) {
      const o = overrides[l.line]
      ing = o ? ingById.get(o) : undefined
    } else {
      ing = (l.code && byCode.get(norm(l.code))) || byName.get(norm(l.name))
      if (!ing && l.name) {
        const top = rankMatches(l.name, opts, 1)[0]
        if (top && top.score >= 0.72) { ing = ingById.get(top.id); score = top.score }
      }
    }
    if (!ing) return { line: l, ingredientId: null, matchScore: 0, kind: 'new' }
    used.add(ing.id)
    let next = l.price
    let note: string | undefined
    let kind: DiffKind
    if (l.packQty && Math.abs(l.packQty - ing.packQty) > 1e-9) {
      const pu = l.packUnit ? parseUnit(l.packUnit) : ing.packUnit
      if (pu === ing.packUnit) {
        // Normalise to the ingredient's current pack so price history stays comparable.
        next = (l.price / l.packQty) * ing.packQty
        note = `Pack changed ${ing.packQty} → ${l.packQty} ${l.packUnit ?? ''}; price normalised to current pack`.trim()
      } else note = `Pack ${l.packQty} ${l.packUnit ?? ''} differs from ${ing.packQty} ${ing.packUnit}; check before applying`
    }
    const pct = ing.price > 0 ? ((next - ing.price) / ing.price) * 100 : 0
    if (note && note.startsWith('Pack') && note.includes('check')) kind = 'pack'
    else if (Math.abs(next - ing.price) < 0.005) kind = 'same'
    else kind = next > ing.price ? 'up' : 'down'
    return { line: l, ingredientId: ing.id, matchScore: score, kind, old: ing.price, next, pct, note }
  })
  const suppliers = new Set(lines.map((l) => norm(l.supplier)).filter(Boolean))
  const missing = ingredients.filter((i) => !used.has(i.id) && suppliers.has(norm(i.supplier)))
  return { rows, missing }
}

/** Apply up/down/pack rows; append to price history. Returns new ingredient list. */
export function applyPrices(ingredients: Ingredient[], diff: PriceDiff, date: string, source: string): Ingredient[] {
  const changes = new Map<string, number>()
  for (const r of diff.rows) if (r.ingredientId && r.next !== undefined && (r.kind === 'up' || r.kind === 'down' || r.kind === 'pack')) changes.set(r.ingredientId, r.next)
  return ingredients.map((i) => {
    const p = changes.get(i.id)
    if (p === undefined) return i
    const history = i.history.length ? i.history : [{ date: '', price: i.price, source: 'initial' }]
    return { ...i, price: Math.round(p * 10000) / 10000, history: [...history, { date, price: p, source }] }
  })
}

export interface SpikeAlert {
  id: string
  name: string
  before: number
  after: number
  target: number
  overBy: number // points above target after change
  costDelta: number
  driver?: { name: string; delta: number }
  crossed: boolean // was at/below target, now above
}

/** Dishes whose food-cost % worsened past the target after a price change, with the main ingredient driver. */
export function spikeAlerts(before: ProjectData, after: ProjectData): SpikeAlert[] {
  const target = after.settings.targetFcPct
  const a = costMenu(before)
  const b = new Map(costMenu(after).map((c) => [c.item.id, c]))
  const ingName = new Map(after.ingredients.map((i) => [i.id, i.name]))
  const out: SpikeAlert[] = []
  for (const x of a) {
    const y = b.get(x.item.id)
    if (!y) continue
    if (y.fcPct <= target || y.fcPct <= x.fcPct + 1e-9) continue
    out.push({
      id: x.item.id,
      name: x.item.name,
      before: x.fcPct,
      after: y.fcPct,
      target,
      overBy: y.fcPct - target,
      costDelta: y.cost - x.cost,
      driver: topDriver(x, y, ingName),
      crossed: x.fcPct <= target,
    })
  }
  return out.sort((p, q) => Number(q.crossed) - Number(p.crossed) || q.overBy - p.overBy)
}

function topDriver(x: ItemCost, y: ItemCost, names: Map<string, string>) {
  let best: { name: string; delta: number } | undefined
  for (const [id, v] of y.leaves) {
    const d = v - (x.leaves.get(id) ?? 0)
    if (!best || d > best.delta) best = { name: names.get(id) ?? id, delta: d }
  }
  return best && best.delta > 0 ? best : undefined
}
