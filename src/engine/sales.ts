import { findHeaderRow, norm, parseCsv, parseNumber, pickColumn, rankMatches, type Candidate } from './csv.ts'
import type { MenuItem } from './types.ts'

export type SalesFormat = 'lightspeed-k-product-mix' | 'lightspeed-l-receipt-items' | 'lightspeed-l-products' | 'generic'

export const FORMAT_LABEL: Record<SalesFormat, string> = {
  'lightspeed-k-product-mix': 'Lightspeed K-Series · Product Mix export',
  'lightspeed-l-receipt-items': 'Lightspeed L-Series · Export Data › Receipt items',
  'lightspeed-l-products': 'Lightspeed L-Series · Products report',
  generic: 'Generic POS item-sales CSV',
}

export interface SalesMapping {
  name: number
  qty: number
  revenue: number // -1 when absent
  status: number // -1 when absent; rows with void/cancelled status are skipped
  date: number // -1 when absent
}

export interface SalesDetect {
  format: SalesFormat
  headerRow: number
  headers: string[]
  mapping: SalesMapping
  revenueTaxIncluded: boolean
  rows: string[][]
}

const KEYWORDS = ['item name', 'quantity', 'sales tax excl', 'accounting group', 'amount', 'total tax excl price', 'receipt id', 'product', 'qty', 'net sales', 'name']

export function detectSales(text: string): SalesDetect {
  const all = parseCsv(text)
  const headerRow = findHeaderRow(all, KEYWORDS)
  const headers = all[headerRow] ?? []
  const h = headers.map(norm)
  const has = (s: string) => h.includes(s)
  let format: SalesFormat = 'generic'
  if (has('item name') && has('accounting group') && h.some((x) => x.startsWith('sales tax'))) format = 'lightspeed-k-product-mix'
  else if (has('receipt id') && has('item name') && has('amount')) format = 'lightspeed-l-receipt-items'
  else if (h.some((x) => x.includes('product')) && h.some((x) => x.includes('profit') || x.includes('cost'))) format = 'lightspeed-l-products'

  const name = pickColumn(headers, ['item name', 'menu item', 'product name', 'item', 'product', 'name', 'description', 'article'])
  let qty: number
  if (format === 'lightspeed-l-receipt-items') qty = pickColumn(headers, ['amount', 'quantity', 'qty'])
  else qty = pickColumn(headers, ['quantity', 'qty', 'items sold', 'sold', 'count', 'units', 'number sold', 'amount'], [name])
  const exclTax = pickColumn(headers, ['sales tax excl', 'total tax excl price', 'net sales', 'net revenue', 'net', 'sales excl tax', 'revenue excl tax', 'turnover excl'], [name, qty])
  const inclTax = pickColumn(headers, ['sales tax incl', 'total price', 'gross sales', 'sales', 'revenue', 'total', 'turnover'], [name, qty])
  const revenue = exclTax >= 0 ? exclTax : inclTax
  return {
    format,
    headerRow,
    headers,
    mapping: {
      name,
      qty,
      revenue,
      status: pickColumn(headers, ['status', 'void status']),
      date: pickColumn(headers, ['creation date', 'date', 'finalized date', 'business day']),
    },
    revenueTaxIncluded: exclTax < 0 && inclTax >= 0,
    rows: all.slice(headerRow + 1),
  }
}

export interface SalesIssue { line: number; message: string }

export interface AggregatedSale { posName: string; qty: number; revenue: number; lines: number }

export interface SalesParse {
  items: AggregatedSale[]
  issues: SalesIssue[]
  skipped: number
  dates: { min?: string; max?: string }
}

const SKIP_NAME = /^(total|totals|grand total|subtotal|sub total|sum)\b/i
const VOID = /void|cancel|delet|refund/i

/** Aggregate a sales export into one row per POS item name. Line numbers are 1-based file lines. */
export function aggregateSales(d: SalesDetect, mapping = d.mapping): SalesParse {
  const issues: SalesIssue[] = []
  const by = new Map<string, AggregatedSale>()
  let skipped = 0
  const dates: string[] = []
  if (mapping.name < 0) issues.push({ line: d.headerRow + 1, message: 'No item-name column mapped' })
  if (mapping.qty < 0) issues.push({ line: d.headerRow + 1, message: 'No quantity column mapped' })
  if (mapping.name < 0 || mapping.qty < 0) return { items: [], issues, skipped: d.rows.length, dates: {} }
  d.rows.forEach((r, i) => {
    const line = d.headerRow + 2 + i
    const name = (r[mapping.name] ?? '').trim()
    if (!name || SKIP_NAME.test(name)) { skipped++; return }
    if (mapping.status >= 0 && VOID.test(r[mapping.status] ?? '')) { skipped++; return }
    const qty = parseNumber(r[mapping.qty])
    if (!Number.isFinite(qty)) {
      // Group header rows in Product Mix exports have a name but no numbers.
      if (r.filter(Boolean).length <= 2) { skipped++; return }
      issues.push({ line, message: `Quantity "${r[mapping.qty] ?? ''}" is not a number for "${name}"` })
      return
    }
    const rev = mapping.revenue >= 0 ? parseNumber(r[mapping.revenue]) : 0
    if (mapping.revenue >= 0 && !Number.isFinite(rev)) issues.push({ line, message: `Revenue "${r[mapping.revenue]}" is not a number; counted as 0` })
    if (mapping.date >= 0 && r[mapping.date]) dates.push(r[mapping.date].slice(0, 10))
    const key = norm(name)
    const cur = by.get(key) ?? { posName: name, qty: 0, revenue: 0, lines: 0 }
    cur.qty += qty
    cur.revenue += Number.isFinite(rev) ? rev : 0
    cur.lines++
    by.set(key, cur)
  })
  dates.sort()
  return { items: [...by.values()].sort((a, b) => b.qty - a.qty), issues, skipped, dates: { min: dates[0], max: dates[dates.length - 1] } }
}

export interface SalesMatch {
  sale: AggregatedSale
  menuItemId: string | null
  status: 'exact' | 'fuzzy' | 'unmatched'
  candidates: Candidate[]
}

export const AUTO_MATCH = 0.86
export const SUGGEST = 0.45

/** Match POS names to menu items: exact name/alias first, then fuzzy. Fuzzy hits need the user to confirm. */
export function matchSales(items: AggregatedSale[], menu: MenuItem[]): SalesMatch[] {
  const options = menu.map((m) => ({ id: m.id, names: [m.name, ...m.aliases] }))
  const exact = new Map<string, string>()
  for (const o of options) for (const n of o.names) exact.set(norm(n), o.id)
  return items.map((sale) => {
    const id = exact.get(norm(sale.posName))
    if (id) return { sale, menuItemId: id, status: 'exact', candidates: [] }
    const candidates = rankMatches(sale.posName, options).filter((c) => c.score >= SUGGEST)
    const top = candidates[0]
    if (top && top.score >= AUTO_MATCH) return { sale, menuItemId: top.id, status: 'fuzzy', candidates }
    return { sale, menuItemId: null, status: 'unmatched', candidates }
  })
}
