import { asPurchased, costMenu, costPerPackUnit, subQtyInYield } from './costing.ts'
import { toCsv } from './csv.ts'
import { engInputs, engineer, type EngResult, type Quadrant } from './engineering.ts'
import type { Ingredient, ProjectData, Recipe, SalesPeriod, Unit } from './types.ts'

/** Recipes ordered parents-first (dishes before the sub-recipes they use). Assumes no cycles. */
export function topoParentsFirst(recipes: Recipe[]): Recipe[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const post: Recipe[] = []
  const visit = (r: Recipe) => {
    if (seen.has(r.id)) return
    seen.add(r.id)
    for (const l of r.lines) if (l.ref.kind === 'rec') { const c = byId.get(l.ref.id); if (c) visit(c) }
    post.push(r)
  }
  recipes.forEach(visit)
  return post.reverse()
}

export interface OrderLine {
  ingredient: Ingredient
  need: number // as-purchased, in pack units
  packs: number // purchase units, rounded up
  cost: number
}

export interface PrepLine {
  recipe: Recipe
  need: number // in yield units
  batches: number // rounded up to half batches
}

export interface Forecast {
  portions: Map<string, number> // menu item id -> forecast portions
  order: OrderLine[]
  prep: PrepLine[]
  unconvertible: string[]
}

/** Forecast portions from a sales period's mix scaled to forecast covers, then explode to prep batches and an order guide. */
export function forecast(data: ProjectData, period: SalesPeriod, covers: number, onHand: Record<string, number> = {}): Forecast {
  const portions = new Map<string, number>()
  const base = period.covers > 0 ? period.covers : period.rows.reduce((s, r) => s + r.qty, 0)
  for (const r of period.rows) portions.set(r.menuItemId, base > 0 ? (r.qty / base) * covers : 0)
  const recById = new Map(data.recipes.map((r) => [r.id, r]))
  const ingById = new Map(data.ingredients.map((i) => [i.id, i]))
  const batches = new Map<string, number>()
  const subNeed = new Map<string, number>()
  const apNeed = new Map<string, number>()
  const unconvertible = new Set<string>()
  for (const m of data.menu) {
    const p = portions.get(m.id) ?? 0
    const r = recById.get(m.recipeId)
    if (!r || p <= 0) continue
    batches.set(r.id, (batches.get(r.id) ?? 0) + p / Math.max(1, r.portions || 1))
    for (const mod of m.modifiers) {
      for (const l of mod.lines) {
        const q = l.qty * p * (mod.attachPct / 100)
        if (l.ref.kind === 'ing') addAp(l.ref.id, q, l.unit)
        else { const s = recById.get(l.ref.id); const y = s && subQtyInYield(s, q, l.unit); if (s && y != null) subNeed.set(s.id, (subNeed.get(s.id) ?? 0) + y) }
      }
    }
  }
  function addAp(id: string, qty: number, unit: Unit) {
    const ing = ingById.get(id)
    if (!ing) return
    const ap = asPurchased(ing, qty, unit)
    if (ap === null) { unconvertible.add(ing.name); return }
    apNeed.set(id, (apNeed.get(id) ?? 0) + ap)
  }
  const prep: PrepLine[] = []
  for (const r of topoParentsFirst(data.recipes)) {
    let b = batches.get(r.id) ?? 0
    if (r.kind === 'sub') {
      const need = subNeed.get(r.id) ?? 0
      if (need <= 0) continue
      b = Math.ceil((need / (r.yieldQty || 1)) * 2 - 1e-9) / 2
      prep.push({ recipe: r, need, batches: b })
    }
    if (b <= 0) continue
    for (const l of r.lines) {
      if (l.ref.kind === 'ing') addAp(l.ref.id, l.qty * b, l.unit)
      else {
        const s = recById.get(l.ref.id)
        const y = s && subQtyInYield(s, l.qty * b, l.unit)
        if (s && y != null) subNeed.set(s.id, (subNeed.get(s.id) ?? 0) + y)
        else if (s) unconvertible.add(s.name)
      }
    }
  }
  const order: OrderLine[] = []
  for (const [id, need] of apNeed) {
    const ing = ingById.get(id)!
    const net = Math.max(0, need - (onHand[id] ?? 0) * ing.packQty)
    const packs = ing.packQty > 0 ? Math.ceil(net / ing.packQty - 1e-9) : 0
    order.push({ ingredient: ing, need, packs, cost: packs * ing.price })
  }
  order.sort((a, b) => a.ingredient.supplier.localeCompare(b.ingredient.supplier) || a.ingredient.name.localeCompare(b.ingredient.name))
  return { portions, order, prep, unconvertible: [...unconvertible] }
}

export function scaleRecipe(r: Recipe, factor: number): Recipe {
  return { ...r, yieldQty: r.yieldQty * factor, portions: r.portions * factor, lines: r.lines.map((l) => ({ ...l, qty: l.qty * factor })) }
}

// ---------- snapshots ----------

export interface Snapshot {
  id: string
  projectId: string
  label: string
  createdAt: string
  data: ProjectData
}

export interface Kpis {
  items: number
  avgFcPct: number // simple average plate food cost % across menu
  theoreticalFcPct: number // sales-weighted
  totalCm: number
  revenue: number
  overTarget: number
}

export function kpis(data: ProjectData, period?: SalesPeriod): Kpis & { eng: EngResult } {
  const costs = costMenu(data)
  const p = period ?? data.sales[data.sales.length - 1]
  const eng = engineer(engInputs(costs, p), { popularityFactor: data.settings.popularityFactor, targetFcPct: data.settings.targetFcPct })
  return {
    items: costs.length,
    avgFcPct: costs.length ? costs.reduce((s, c) => s + c.fcPct, 0) / costs.length : 0,
    theoreticalFcPct: eng.fcPct,
    totalCm: eng.totalCm,
    revenue: eng.revenue,
    overTarget: costs.filter((c) => c.fcPct > data.settings.targetFcPct).length,
    eng,
  }
}

export interface ItemChange {
  id: string
  name: string
  costA?: number
  costB?: number
  priceA?: number
  priceB?: number
  fcA?: number
  fcB?: number
  quadA?: Quadrant
  quadB?: Quadrant
}

export interface Comparison {
  a: Kpis
  b: Kpis
  items: ItemChange[]
  prices: { name: string; a: number; b: number; pct: number }[]
  added: string[]
  removed: string[]
}

export function compare(a: ProjectData, b: ProjectData): Comparison {
  const ka = kpis(a)
  const kb = kpis(b)
  const ca = new Map(costMenu(a).map((c) => [c.item.id, c]))
  const cb = new Map(costMenu(b).map((c) => [c.item.id, c]))
  const qa = new Map(ka.eng.rows.map((r) => [r.id, r.quadrant]))
  const qb = new Map(kb.eng.rows.map((r) => [r.id, r.quadrant]))
  const ids = new Set([...ca.keys(), ...cb.keys()])
  const items: ItemChange[] = []
  for (const id of ids) {
    const x = ca.get(id)
    const y = cb.get(id)
    const ch: ItemChange = {
      id, name: (y ?? x)!.item.name,
      costA: x?.cost, costB: y?.cost, priceA: x?.price, priceB: y?.price, fcA: x?.fcPct, fcB: y?.fcPct,
      quadA: a.sales.length ? qa.get(id) : undefined, quadB: b.sales.length ? qb.get(id) : undefined,
    }
    const moved = !x || !y || Math.abs(x.cost - y.cost) > 0.005 || Math.abs(x.price - y.price) > 0.005 || ch.quadA !== ch.quadB
    if (moved) items.push(ch)
  }
  const ia = new Map(a.ingredients.map((i) => [i.id, i]))
  const prices = b.ingredients
    .filter((i) => ia.has(i.id) && Math.abs(ia.get(i.id)!.price - i.price) > 0.005)
    .map((i) => { const o = ia.get(i.id)!.price; return { name: i.name, a: o, b: i.price, pct: o > 0 ? ((i.price - o) / o) * 100 : 0 } })
    .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct))
  const names = (d: ProjectData) => new Map(d.menu.map((m) => [m.id, m.name]))
  const na = names(a)
  const nb = names(b)
  return {
    a: ka, b: kb, items, prices,
    added: [...nb].filter(([id]) => !na.has(id)).map(([, n]) => n),
    removed: [...na].filter(([id]) => !nb.has(id)).map(([, n]) => n),
  }
}

// ---------- CSV exports ----------

export function ingredientsCsv(d: ProjectData): string {
  return toCsv([
    ['Ingredient', 'Category', 'Supplier', 'Code', 'Purchase unit', 'Pack qty', 'Pack unit', 'Price', 'Cost per pack unit', 'Yield %', 'Density g/ml', 'Each g'],
    ...d.ingredients.map((i) => [i.name, i.category, i.supplier, i.code ?? '', i.purchaseUnit, i.packQty, i.packUnit, i.price, costPerPackUnit(i), i.yieldPct, i.densityGPerMl ?? '', i.eachG ?? '']),
  ])
}

export function menuCostCsv(d: ProjectData): string {
  return toCsv([
    ['Menu item', 'Category', 'Price', 'Plate cost', 'Expected cost incl. modifiers', 'Food cost %', 'Contribution margin', `Price at ${d.settings.targetFcPct}% target`],
    ...costMenu(d).map((c) => [c.item.name, c.item.category, c.item.price, c.plateCost, c.cost, c.fcPct, c.cm, c.suggested]),
  ])
}

export function engineeringCsv(eng: EngResult): string {
  return toCsv([
    ['Menu item', 'Sold', 'Mix %', 'Avg price', 'Cost', 'CM', 'Total CM', 'Food cost %', 'Class', 'Action'],
    ...eng.rows.map((r) => [r.name, r.qty, r.mixPct, r.price, r.cost, r.cm, r.totalCm, r.fcPct, r.quadrant, r.action]),
  ])
}

export function orderGuideCsv(f: Forecast): string {
  return toCsv([
    ['Supplier', 'Ingredient', 'Code', 'Need (pack units)', 'Pack unit', 'Order qty', 'Purchase unit', 'Est. cost'],
    ...f.order.map((o) => [o.ingredient.supplier, o.ingredient.name, o.ingredient.code ?? '', o.need, o.ingredient.packUnit, o.packs, o.ingredient.purchaseUnit, o.cost]),
  ])
}
