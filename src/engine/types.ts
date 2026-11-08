export type Unit =
  | 'g' | 'kg' | 'oz' | 'lb'
  | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz' | 'qt' | 'gal'
  | 'ea' | 'dozen'
  | 'portion'

export interface PricePoint {
  date: string // ISO yyyy-mm-dd
  price: number // per purchase unit
  source: string
}

export interface Ingredient {
  id: string
  name: string
  category: string
  supplier: string
  code?: string // supplier item code
  purchaseUnit: string // label like "case", "bag", "kg"
  packQty: number // how many packUnit in one purchase unit
  packUnit: Unit
  price: number // per purchase unit, tax excluded
  yieldPct: number // usable share after trim, 1..100
  densityGPerMl?: number // for volume <-> weight
  eachG?: number // weight of one "each"
  history: PricePoint[]
}

export type LineRef = { kind: 'ing' | 'rec'; id: string }

export interface RecipeLine {
  ref: LineRef
  qty: number
  unit: Unit
  note?: string
}

export interface Recipe {
  id: string
  name: string
  kind: 'dish' | 'sub'
  yieldQty: number // batch yield amount in yieldUnit
  yieldUnit: Unit
  portions: number // portions per batch (dish) or 0 for subs
  densityGPerMl?: number
  lines: RecipeLine[]
  method?: string
}

export interface Modifier {
  id: string
  name: string
  price: number
  attachPct: number // share of orders that add it, 0..100
  lines: RecipeLine[]
}

export interface MenuItem {
  id: string
  name: string
  category: string
  recipeId: string
  price: number // menu price, tax excluded
  modifiers: Modifier[]
  aliases: string[] // POS names mapped to this item
}

export interface SalesRow {
  menuItemId: string
  qty: number
  revenue: number // net revenue (tax excl), 0 if unknown
}

export interface SalesPeriod {
  id: string
  label: string // e.g. "2026-10"
  source: string
  covers: number
  rows: SalesRow[]
  importedAt: string
}

export interface ActualCost {
  periodId: string
  opening: number
  purchases: number
  closing: number
}

export interface PriceImport {
  id: string
  date: string
  supplier: string
  fileName: string
  changes: { ingredientId: string; old: number; new: number }[]
  created: number
  alerts: { id: string; name: string; before: number; after: number; overBy: number; crossed: boolean; driver?: string }[]
}

export interface Settings {
  currency: string
  targetFcPct: number
  elasticity: number
  popularityFactor: number // Kasavana-Smith uses 0.7
}

export interface ProjectData {
  restaurant: string
  settings: Settings
  ingredients: Ingredient[]
  recipes: Recipe[]
  menu: MenuItem[]
  sales: SalesPeriod[]
  actuals: ActualCost[]
  priceImports: PriceImport[]
  synthetic?: boolean
}
