import type { Ingredient, MenuItem, ProjectData, Recipe, RecipeLine, Unit } from './types.ts'
import { convert, UNIT_LABEL } from './units.ts'

export interface LineCost {
  line: RecipeLine
  name: string
  cost: number
  error?: string
  /** Leaf ingredient costs this line contributes, used for breakdowns and spike tracing. */
  leaves: Map<string, number>
}

export interface RecipeCost {
  recipeId: string
  batchCost: number
  /** Cost of one portion (dish) or one yield unit (sub-recipe). */
  unitCost: number
  lines: LineCost[]
  errors: string[]
  leaves: Map<string, number>
}

export class CycleError extends Error {
  path: string[]
  constructor(path: string[]) {
    super(`Recipe cycle: ${path.join(' → ')}`)
    this.path = path
  }
}

/** Cost per pack unit of an ingredient, as purchased. */
export function costPerPackUnit(ing: Ingredient): number {
  return ing.packQty > 0 ? ing.price / ing.packQty : 0
}

/** Cost of an edible-portion quantity of an ingredient, grossed up for trim loss. */
export function ingredientCost(ing: Ingredient, qty: number, unit: Unit): number | null {
  const inPack = convert(qty, unit, ing.packUnit, ing)
  if (inPack === null) return null
  const y = Math.min(100, Math.max(1, ing.yieldPct || 100)) / 100
  return (inPack / y) * costPerPackUnit(ing)
}

/** As-purchased quantity (in pack units) needed for an edible-portion quantity. */
export function asPurchased(ing: Ingredient, qty: number, unit: Unit): number | null {
  const inPack = convert(qty, unit, ing.packUnit, ing)
  if (inPack === null) return null
  return inPack / (Math.min(100, Math.max(1, ing.yieldPct || 100)) / 100)
}

/** Quantity of a sub-recipe line expressed in that recipe's yield units. */
export function subQtyInYield(r: Recipe, qty: number, unit: Unit): number | null {
  if (unit === 'portion') return r.portions > 0 ? (qty / r.portions) * r.yieldQty : null
  if (r.yieldUnit === 'portion') return null
  return convert(qty, unit, r.yieldUnit, { densityGPerMl: r.densityGPerMl })
}

export interface Book {
  ing: Map<string, Ingredient>
  rec: Map<string, Recipe>
  memo: Map<string, RecipeCost>
}

export function makeBook(data: Pick<ProjectData, 'ingredients' | 'recipes'>): Book {
  return {
    ing: new Map(data.ingredients.map((i) => [i.id, i])),
    rec: new Map(data.recipes.map((r) => [r.id, r])),
    memo: new Map(),
  }
}

function addLeaves(into: Map<string, number>, from: Map<string, number>, scale = 1) {
  for (const [k, v] of from) into.set(k, (into.get(k) ?? 0) + v * scale)
}

export function costLines(book: Book, lines: RecipeLine[], stack: string[] = []): LineCost[] {
  return lines.map((line) => {
    const leaves = new Map<string, number>()
    if (line.ref.kind === 'ing') {
      const ing = book.ing.get(line.ref.id)
      if (!ing) return { line, name: 'Missing ingredient', cost: 0, error: 'Ingredient was deleted', leaves }
      const c = ingredientCost(ing, line.qty, line.unit)
      if (c === null)
        return { line, name: ing.name, cost: 0, leaves, error: `Can't convert ${UNIT_LABEL[line.unit]} to ${UNIT_LABEL[ing.packUnit]}: add a density or each-weight` }
      leaves.set(ing.id, c)
      return { line, name: ing.name, cost: c, leaves }
    }
    const sub = book.rec.get(line.ref.id)
    if (!sub) return { line, name: 'Missing recipe', cost: 0, error: 'Sub-recipe was deleted', leaves }
    const rc = costRecipe(book, sub.id, stack)
    const q = subQtyInYield(sub, line.qty, line.unit)
    if (q === null)
      return { line, name: sub.name, cost: 0, leaves, error: `Can't convert ${UNIT_LABEL[line.unit]} to ${UNIT_LABEL[sub.yieldUnit]} for ${sub.name}` }
    const share = sub.yieldQty > 0 ? q / sub.yieldQty : 0
    addLeaves(leaves, rc.leaves, share)
    return { line, name: sub.name, cost: rc.batchCost * share, leaves, error: rc.errors.length ? `${sub.name} has issues` : undefined }
  })
}

/** Cost a recipe batch, recursing through sub-recipes. Throws CycleError on circular references. */
export function costRecipe(book: Book, id: string, stack: string[] = []): RecipeCost {
  const hit = book.memo.get(id)
  if (hit) return hit
  const r = book.rec.get(id)
  if (!r) throw new Error(`Unknown recipe ${id}`)
  if (stack.includes(id)) throw new CycleError([...stack, id].map((x) => book.rec.get(x)?.name ?? x))
  const lines = costLines(book, r.lines, [...stack, id])
  const batchCost = lines.reduce((s, l) => s + l.cost, 0)
  const leaves = new Map<string, number>()
  for (const l of lines) addLeaves(leaves, l.leaves)
  const div = r.kind === 'dish' ? Math.max(1, r.portions || 1) : r.yieldQty || 1
  const res: RecipeCost = {
    recipeId: id,
    batchCost,
    unitCost: batchCost / div,
    lines,
    errors: lines.filter((l) => l.error).map((l) => l.error!),
    leaves,
  }
  book.memo.set(id, res)
  return res
}

/** Find every cycle in the recipe graph (as name paths). Empty when the graph is a DAG. */
export function findCycles(recipes: Recipe[]): string[][] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const state = new Map<string, 1 | 2>()
  const out: string[][] = []
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      const from = path.indexOf(id)
      out.push([...path.slice(from), id].map((x) => byId.get(x)?.name ?? x))
      return
    }
    state.set(id, 1)
    for (const l of byId.get(id)?.lines ?? []) if (l.ref.kind === 'rec' && byId.has(l.ref.id)) visit(l.ref.id, [...path, id])
    state.set(id, 2)
  }
  for (const r of recipes) visit(r.id, [])
  return out
}

/** Would adding `childId` as a line of `parentId` create a cycle? */
export function wouldCycle(recipes: Recipe[], parentId: string, childId: string): boolean {
  if (parentId === childId) return true
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const stack = [childId]
  while (stack.length) {
    const id = stack.pop()!
    if (id === parentId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const l of byId.get(id)?.lines ?? []) if (l.ref.kind === 'rec') stack.push(l.ref.id)
  }
  return false
}

/** Recipes that use the given recipe or ingredient, directly or through sub-recipes. */
export function usedBy(recipes: Recipe[], ref: { kind: 'ing' | 'rec'; id: string }): Recipe[] {
  const hits = new Set<string>()
  let frontier = [ref]
  while (frontier.length) {
    const next: { kind: 'ing' | 'rec'; id: string }[] = []
    for (const r of recipes) {
      if (hits.has(r.id)) continue
      if (r.lines.some((l) => frontier.some((f) => f.kind === l.ref.kind && f.id === l.ref.id))) {
        hits.add(r.id)
        next.push({ kind: 'rec', id: r.id })
      }
    }
    frontier = next
  }
  return recipes.filter((r) => hits.has(r.id))
}

export interface ItemCost {
  item: MenuItem
  plateCost: number
  /** Expected cost including modifiers weighted by attach rate. */
  cost: number
  /** Expected revenue per order including modifiers. */
  price: number
  fcPct: number
  cm: number
  suggested: number
  errors: string[]
  leaves: Map<string, number>
}

export function menuPrice(raw: number): number {
  return Math.ceil(raw * 2 - 1e-9) / 2
}

export function costItem(book: Book, item: MenuItem, targetFcPct: number): ItemCost {
  const errors: string[] = []
  let plateCost = 0
  const leaves = new Map<string, number>()
  if (book.rec.has(item.recipeId)) {
    try {
      const rc = costRecipe(book, item.recipeId)
      plateCost = rc.unitCost
      errors.push(...rc.errors)
      const p = Math.max(1, book.rec.get(item.recipeId)!.portions || 1)
      addLeaves(leaves, rc.leaves, 1 / p)
    } catch (e) {
      errors.push((e as Error).message)
    }
  } else errors.push('No recipe linked')
  let cost = plateCost
  let price = item.price
  for (const m of item.modifiers) {
    const a = m.attachPct / 100
    let lc: LineCost[]
    try { lc = costLines(book, m.lines) } catch (e) { errors.push(`${m.name}: ${(e as Error).message}`); continue }
    for (const l of lc) {
      if (l.error) errors.push(`${m.name}: ${l.error}`)
      addLeaves(leaves, l.leaves, a)
    }
    cost += lc.reduce((s, l) => s + l.cost, 0) * a
    price += m.price * a
  }
  const fcPct = price > 0 ? (cost / price) * 100 : 0
  return {
    item,
    plateCost,
    cost,
    price,
    fcPct,
    cm: price - cost,
    suggested: targetFcPct > 0 ? menuPrice(plateCost / (targetFcPct / 100)) : 0,
    errors,
    leaves,
  }
}

export function costMenu(data: ProjectData): ItemCost[] {
  const book = makeBook(data)
  return data.menu.map((m) => costItem(book, m, data.settings.targetFcPct))
}
