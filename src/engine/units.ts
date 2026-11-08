import type { Unit } from './types.ts'

export type Dim = 'weight' | 'volume' | 'count' | 'portion'

// Factor to the base unit of each dimension: grams, millilitres, each.
const TABLE: Record<Unit, [Dim, number]> = {
  g: ['weight', 1],
  kg: ['weight', 1000],
  oz: ['weight', 28.349523125],
  lb: ['weight', 453.59237],
  ml: ['volume', 1],
  l: ['volume', 1000],
  tsp: ['volume', 4.92892159375],
  tbsp: ['volume', 14.78676478125],
  cup: ['volume', 236.5882365],
  floz: ['volume', 29.5735295625],
  qt: ['volume', 946.352946],
  gal: ['volume', 3785.411784],
  ea: ['count', 1],
  dozen: ['count', 12],
  portion: ['portion', 1],
}

export const UNITS = Object.keys(TABLE) as Unit[]
export const UNIT_LABEL: Record<Unit, string> = {
  g: 'g', kg: 'kg', oz: 'oz', lb: 'lb', ml: 'ml', l: 'L', tsp: 'tsp', tbsp: 'tbsp', cup: 'cup',
  floz: 'fl oz', qt: 'qt', gal: 'gal', ea: 'each', dozen: 'dozen', portion: 'portion',
}

export function dimOf(u: Unit): Dim {
  return TABLE[u][0]
}

export function isUnit(s: string): s is Unit {
  return s in TABLE
}

const ALIASES: Record<string, Unit> = {
  gram: 'g', grams: 'g', gr: 'g', kilo: 'kg', kilos: 'kg', kgs: 'kg', kilogram: 'kg',
  ounce: 'oz', ounces: 'oz', lbs: 'lb', pound: 'lb', pounds: 'lb', '#': 'lb',
  millilitre: 'ml', milliliter: 'ml', litre: 'l', liter: 'l', ltr: 'l', lt: 'l',
  teaspoon: 'tsp', tablespoon: 'tbsp', tbs: 'tbsp', cups: 'cup', 'fl oz': 'floz', 'fl.oz': 'floz',
  quart: 'qt', gallon: 'gal', each: 'ea', pc: 'ea', pcs: 'ea', piece: 'ea', pieces: 'ea', unit: 'ea', units: 'ea',
  ct: 'ea', count: 'ea', dz: 'dozen', doz: 'dozen', portions: 'portion', serving: 'portion', servings: 'portion',
}

export function parseUnit(raw: string): Unit | null {
  const s = raw.trim().toLowerCase()
  if (isUnit(s)) return s
  return ALIASES[s] ?? null
}

export interface ConvertCtx {
  densityGPerMl?: number
  eachG?: number
}

/** Convert qty between units. Returns null when the dimensions cannot be bridged with the given density / each-weight. */
export function convert(qty: number, from: Unit, to: Unit, ctx: ConvertCtx = {}): number | null {
  const [fd, ff] = TABLE[from]
  const [td, tf] = TABLE[to]
  if (fd === 'portion' || td === 'portion') return fd === td ? qty : null
  let base = qty * ff
  if (fd === td) return base / tf
  // Bring everything through grams.
  let grams: number | null = null
  if (fd === 'weight') grams = base
  else if (fd === 'volume') grams = ctx.densityGPerMl ? base * ctx.densityGPerMl : null
  else if (fd === 'count') grams = ctx.eachG ? base * ctx.eachG : null
  if (grams === null) return null
  if (td === 'weight') base = grams
  else if (td === 'volume') { if (!ctx.densityGPerMl) return null; base = grams / ctx.densityGPerMl }
  else { if (!ctx.eachG) return null; base = grams / ctx.eachG }
  return base / tf
}

export function fmtQty(qty: number, unit: Unit): string {
  const n = Math.abs(qty) >= 100 ? Math.round(qty).toString() : Math.abs(qty) >= 10 ? qty.toFixed(1).replace(/\.0$/, '') : (Math.round(qty * 100) / 100).toString()
  return `${n} ${UNIT_LABEL[unit]}`
}

/** Pick a friendlier unit for display, e.g. 1500 g -> 1.5 kg. */
export function humanize(qty: number, unit: Unit): [number, Unit] {
  if (unit === 'g' && qty >= 1000) return [qty / 1000, 'kg']
  if (unit === 'ml' && qty >= 1000) return [qty / 1000, 'l']
  if (unit === 'kg' && qty < 1) return [qty * 1000, 'g']
  if (unit === 'l' && qty < 1) return [qty * 1000, 'ml']
  return [qty, unit]
}

/** Show tiny per-gram or per-millilitre costs per kilogram or litre instead. */
export function perUnit(cost: number, unit: Unit): [number, Unit] {
  if (unit === 'g') return [cost * 1000, 'kg']
  if (unit === 'ml') return [cost * 1000, 'l']
  return [cost, unit]
}
