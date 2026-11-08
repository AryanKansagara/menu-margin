import type { ItemCost } from './costing.ts'
import { menuPrice } from './costing.ts'
import type { SalesPeriod } from './types.ts'

export type Quadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog'

export const QUADRANT: Record<Quadrant, { label: string; blurb: string }> = {
  star: { label: 'Star', blurb: 'Popular and profitable' },
  plowhorse: { label: 'Plowhorse', blurb: 'Popular, thin margin' },
  puzzle: { label: 'Puzzle', blurb: 'Profitable, under-ordered' },
  dog: { label: 'Dog', blurb: 'Neither popular nor profitable' },
}

export interface EngRow {
  id: string
  name: string
  category: string
  qty: number
  mixPct: number
  price: number
  cost: number
  cm: number
  fcPct: number
  totalCm: number
  revenue: number
  highPop: boolean
  highCm: boolean
  quadrant: Quadrant
  action: string
  detail: string
}

export interface EngResult {
  rows: EngRow[]
  totalQty: number
  avgCm: number
  popThreshold: number // mix % threshold
  totalCm: number
  revenue: number
  foodCost: number
  fcPct: number
}

export interface EngInput {
  id: string
  name: string
  category: string
  qty: number
  price: number
  cost: number
}

export function quadrantOf(highPop: boolean, highCm: boolean): Quadrant {
  return highPop ? (highCm ? 'star' : 'plowhorse') : highCm ? 'puzzle' : 'dog'
}

/** Kasavana–Smith menu engineering: popularity vs the 70% rule, CM vs the weighted average. */
export function engineer(items: EngInput[], opts: { popularityFactor?: number; targetFcPct?: number } = {}): EngResult {
  const factor = opts.popularityFactor ?? 0.7
  const target = opts.targetFcPct ?? 30
  const n = items.length
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const totalCm = items.reduce((s, i) => s + (i.price - i.cost) * i.qty, 0)
  const revenue = items.reduce((s, i) => s + i.price * i.qty, 0)
  const foodCost = items.reduce((s, i) => s + i.cost * i.qty, 0)
  const avgCm = totalQty > 0 ? totalCm / totalQty : 0
  const popThreshold = n > 0 ? (100 / n) * factor : 0
  const rows = items.map((i): EngRow => {
    const cm = i.price - i.cost
    const mixPct = totalQty > 0 ? (i.qty / totalQty) * 100 : 0
    const highPop = mixPct >= popThreshold
    const highCm = cm >= avgCm
    const quadrant = quadrantOf(highPop, highCm)
    const fcPct = i.price > 0 ? (i.cost / i.price) * 100 : 0
    const [action, detail] = recommend({ ...i, cm, fcPct, quadrant, avgCm, target })
    return { ...i, cm, mixPct, highPop, highCm, quadrant, fcPct, totalCm: cm * i.qty, revenue: i.price * i.qty, action, detail }
  })
  return { rows, totalQty, avgCm, popThreshold, totalCm, revenue, foodCost, fcPct: revenue > 0 ? (foodCost / revenue) * 100 : 0 }
}

function money(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function recommend(i: EngInput & { cm: number; fcPct: number; quadrant: Quadrant; avgCm: number; target: number }): [string, string] {
  const gap = i.avgCm - i.cm
  const targetPrice = menuPrice(i.cost / (i.target / 100))
  switch (i.quadrant) {
    case 'star':
      return i.fcPct > i.target
        ? ['Keep, test +$' + money(Math.max(0.5, menuPrice(i.price * 0.04))), `Best seller but ${i.fcPct.toFixed(1)}% food cost. A small increase rarely dents a Star.`]
        : ['Protect it', 'Hold the recipe and portion steady, keep it in the prime spot on the menu.']
    case 'plowhorse': {
      const half = Math.max(0.25, gap / 2)
      return [
        `Raise to ${money(menuPrice(Math.min(i.price + half, i.price * 1.1)))} or trim $${money(half)} cost`,
        `Guests already order it. Closing half the $${money(Math.max(0, gap))} CM gap through price or a cheaper component keeps it popular${i.fcPct > i.target ? `; food cost is ${i.fcPct.toFixed(1)}%` : ''}.`,
      ]
    }
    case 'puzzle':
      return ['Promote it', 'Margin is there, demand is not. Move it up the menu, rename, add a server pitch, or trim price slightly.']
    case 'dog':
      return i.fcPct > i.target
        ? ['Re-engineer or cut', `Low demand and ${i.fcPct.toFixed(1)}% food cost. Rework the recipe to ${money(targetPrice)} price point or drop it.`]
        : ['Replace or drop', 'Low demand and below-average margin. Free the menu space for a Puzzle or new item.']
  }
}

/** Build engineering inputs from costing + one sales period. Uses realised average price when revenue is known. */
export function engInputs(costs: ItemCost[], period: SalesPeriod | undefined, useRealised = true): EngInput[] {
  const byId = new Map(period?.rows.map((r) => [r.menuItemId, r]) ?? [])
  return costs.map((c) => {
    const s = byId.get(c.item.id)
    const qty = s?.qty ?? 0
    const realised = useRealised && s && s.revenue > 0 && qty > 0 ? s.revenue / qty : c.price
    return { id: c.item.id, name: c.item.name, category: c.item.category, qty, price: realised, cost: c.cost }
  })
}

/** Constant-elasticity demand response to a price change: q' = q * (p'/p)^e. */
export function respond(qty: number, oldPrice: number, newPrice: number, elasticity: number): number {
  if (oldPrice <= 0 || newPrice <= 0) return qty
  return qty * Math.pow(newPrice / oldPrice, elasticity)
}

export interface WhatIf {
  before: EngResult
  after: EngResult
  rowBefore: EngRow
  rowAfter: EngRow
  qtyAfter: number
  deltaTotalCm: number
}

/** Change one item's price and re-run the whole matrix (thresholds move too). */
export function whatIf(items: EngInput[], id: string, newPrice: number, elasticity: number, opts: { popularityFactor?: number; targetFcPct?: number } = {}): WhatIf {
  const before = engineer(items, opts)
  const changed = items.map((i) => (i.id === id ? { ...i, price: newPrice, qty: respond(i.qty, i.price, newPrice, elasticity) } : i))
  const after = engineer(changed, opts)
  return {
    before,
    after,
    rowBefore: before.rows.find((r) => r.id === id)!,
    rowAfter: after.rows.find((r) => r.id === id)!,
    qtyAfter: changed.find((i) => i.id === id)!.qty,
    deltaTotalCm: after.totalCm - before.totalCm,
  }
}

export interface Variance {
  theoretical: number
  actual: number
  sales: number
  theoreticalPct: number
  actualPct: number
  gapPct: number
  gap: number
}

/** Theoretical (recipe-based) vs actual (opening + purchases - closing) food cost. */
export function variance(eng: EngResult, a: { opening: number; purchases: number; closing: number }): Variance {
  const actual = a.opening + a.purchases - a.closing
  const sales = eng.revenue
  const theoreticalPct = sales > 0 ? (eng.foodCost / sales) * 100 : 0
  const actualPct = sales > 0 ? (actual / sales) * 100 : 0
  return { theoretical: eng.foodCost, actual, sales, theoreticalPct, actualPct, gapPct: actualPct - theoreticalPct, gap: actual - eng.foodCost }
}
