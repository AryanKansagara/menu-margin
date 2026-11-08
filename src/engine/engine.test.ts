import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convert, parseUnit } from './units.ts'
import { costItem, costMenu, costRecipe, CycleError, findCycles, ingredientCost, makeBook, menuPrice, usedBy, wouldCycle } from './costing.ts'
import { decodeBytes, detectDelimiter, parseCsv, parseNumber, similarity, toCsv } from './csv.ts'
import { engineer, engInputs, quadrantOf, respond, variance, whatIf } from './engineering.ts'
import { aggregateSales, detectSales, matchSales } from './sales.ts'
import { applyPrices, diffPrices, parsePriceList, spikeAlerts } from './prices.ts'
import { compare, forecast, scaleRecipe, topoParentsFirst } from './outputs.ts'
import { sampleProductMixCsv, samplePriceListCsv, sampleProject } from './sample.ts'
import type { Ingredient, ProjectData, Recipe } from './types.ts'

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

const ing = (o: Partial<Ingredient> & { id: string }): Ingredient => ({
  name: o.id, category: '', supplier: '', purchaseUnit: 'case', packQty: 1, packUnit: 'kg', price: 10, yieldPct: 100, history: [], ...o,
})

test('unit conversion within and across dimensions', () => {
  near(convert(1, 'lb', 'g')!, 453.59237)
  near(convert(2, 'cup', 'ml')!, 473.176473)
  near(convert(1, 'dozen', 'ea')!, 12)
  assert.equal(convert(100, 'ml', 'g'), null, 'volume to weight needs density')
  near(convert(100, 'ml', 'g', { densityGPerMl: 0.92 })!, 92)
  near(convert(3, 'ea', 'kg', { eachG: 110 })!, 0.33)
  near(convert(500, 'g', 'ea', { eachG: 250 })!, 2)
  near(convert(1, 'tbsp', 'ea', { densityGPerMl: 1, eachG: 14.78676478125 })!, 1)
  assert.equal(convert(1, 'portion', 'g'), null)
  assert.equal(parseUnit('Lbs'), 'lb')
  assert.equal(parseUnit('fl oz'), 'floz')
  assert.equal(parseUnit('bogus'), null)
})

test('ingredient cost grosses up for trim yield', () => {
  const beef = ing({ id: 'b', packQty: 5, packUnit: 'kg', price: 150, yieldPct: 75 })
  // $30/kg as purchased, 75% yield -> $40/kg edible. 200 g = $8.
  near(ingredientCost(beef, 200, 'g')!, 8)
  const oil = ing({ id: 'o', packQty: 4, packUnit: 'l', price: 40 })
  assert.equal(ingredientCost(oil, 100, 'g'), null)
  near(ingredientCost({ ...oil, densityGPerMl: 0.9 }, 90, 'g')!, 1)
})

test('nested sub-recipes cost through every level', () => {
  const data = sampleProject()
  const book = makeBook(data)
  const demi = costRecipe(book, 'r-demi')
  const poivre = costRecipe(book, 'r-poivre')
  // 500 ml of a 2 l demi batch is a quarter of the batch cost.
  const demiLine = poivre.lines.find((l) => l.line.ref.id === 'r-demi')!
  near(demiLine.cost, demi.batchCost / 4)
  // Leaves trace bones through demi into the sauce.
  assert.ok((poivre.leaves.get('bones') ?? 0) > 0)
  near([...poivre.leaves.values()].reduce((s, v) => s + v, 0), poivre.batchCost, 1e-9)
})

test('batch dishes divide by portions', () => {
  const data = sampleProject()
  const book = makeBook(data)
  const soup = costRecipe(book, 'd-soup')
  near(soup.unitCost, soup.batchCost / 10)
  const scaled = scaleRecipe(data.recipes.find((r) => r.id === 'd-soup')!, 2.5)
  assert.equal(scaled.portions, 25)
  near(scaled.lines[0].qty, 7.5)
})

test('cycle detection: findCycles, wouldCycle and CycleError', () => {
  const a: Recipe = { id: 'a', name: 'A', kind: 'sub', yieldQty: 1, yieldUnit: 'kg', portions: 0, lines: [{ ref: { kind: 'rec', id: 'b' }, qty: 1, unit: 'kg' }] }
  const b: Recipe = { id: 'b', name: 'B', kind: 'sub', yieldQty: 1, yieldUnit: 'kg', portions: 0, lines: [{ ref: { kind: 'rec', id: 'c' }, qty: 1, unit: 'kg' }] }
  const c: Recipe = { id: 'c', name: 'C', kind: 'sub', yieldQty: 1, yieldUnit: 'kg', portions: 0, lines: [] }
  assert.deepEqual(findCycles([a, b, c]), [])
  assert.equal(wouldCycle([a, b, c], 'c', 'a'), true)
  assert.equal(wouldCycle([a, b, c], 'a', 'c'), false)
  const c2 = { ...c, lines: [{ ref: { kind: 'rec' as const, id: 'a' }, qty: 1, unit: 'kg' as const }] }
  assert.deepEqual(findCycles([a, b, c2])[0], ['A', 'B', 'C', 'A'])
  assert.throws(() => costRecipe(makeBook({ ingredients: [], recipes: [a, b, c2] }), 'a'), CycleError)
})

test('menu item cost, food cost %, CM and suggested price', () => {
  const data = sampleProject()
  const book = makeBook(data)
  const item = data.menu.find((m) => m.id === 'm-croque')!
  const plain = costItem(book, { ...item, modifiers: [] }, 30)
  const withMod = costItem(book, item, 30)
  near(plain.fcPct, (plain.cost / item.price) * 100)
  near(plain.cm, item.price - plain.cost)
  // Madame modifier: 40% attach at $2.50 raises expected price by $1.
  near(withMod.price, item.price + 1)
  assert.ok(withMod.cost > plain.cost)
  assert.equal(plain.suggested, menuPrice(plain.plateCost / 0.3))
  assert.equal(menuPrice(13.01), 13.5)
  assert.equal(menuPrice(13.5), 13.5)
})

test('missing density is reported, not silently zero', () => {
  const data: ProjectData = {
    ...sampleProject(),
    ingredients: [ing({ id: 'oil', packUnit: 'l', packQty: 1 })],
    recipes: [{ id: 'd', name: 'D', kind: 'dish', yieldQty: 1, yieldUnit: 'portion', portions: 1, lines: [{ ref: { kind: 'ing', id: 'oil' }, qty: 10, unit: 'g' }] }],
    menu: [{ id: 'm', name: 'M', category: '', recipeId: 'd', price: 10, modifiers: [], aliases: [] }],
  }
  const [c] = costMenu(data)
  assert.equal(c.cost, 0)
  assert.match(c.errors[0], /density/)
})

test('usedBy walks up through sub-recipes', () => {
  const data = sampleProject()
  const names = usedBy(data.recipes, { kind: 'ing', id: 'bones' }).map((r) => r.id).sort()
  assert.ok(names.includes('r-demi') && names.includes('r-poivre') && names.includes('d-steak') && names.includes('d-soup'))
  assert.ok(!names.includes('d-duck'))
})

test('Kasavana–Smith quadrants with 70% popularity rule', () => {
  const r = engineer([
    { id: 'a', name: 'A', category: '', qty: 100, price: 20, cost: 5 }, // pop, CM 15
    { id: 'b', name: 'B', category: '', qty: 100, price: 12, cost: 6 }, // pop, CM 6
    { id: 'c', name: 'C', category: '', qty: 10, price: 30, cost: 8 }, // unpop, CM 22
    { id: 'd', name: 'D', category: '', qty: 10, price: 10, cost: 6 }, // unpop, CM 4
  ])
  near(r.popThreshold, 17.5)
  near(r.avgCm, (1500 + 600 + 220 + 40) / 220)
  assert.deepEqual(r.rows.map((x) => x.quadrant), ['star', 'plowhorse', 'puzzle', 'dog'])
  assert.equal(quadrantOf(true, false), 'plowhorse')
  assert.ok(r.rows[1].action.startsWith('Raise to'))
})

test('sample bistro yields all four quadrants', () => {
  const d = sampleProject()
  const r = engineer(engInputs(costMenu(d), d.sales[0]))
  const q = new Set(r.rows.map((x) => x.quadrant))
  assert.equal(q.size, 4)
  assert.equal(d.ingredients.length >= 30, true)
  assert.equal(d.recipes.filter((x) => x.kind === 'sub').length, 6)
  assert.equal(d.menu.length, 18)
})

test('price what-if: elasticity and quadrant shift', () => {
  near(respond(100, 10, 11, -1), 100 / 1.1)
  near(respond(100, 10, 11, 0), 100)
  const items = [
    { id: 'a', name: 'A', category: '', qty: 100, price: 20, cost: 5 },
    { id: 'b', name: 'B', category: '', qty: 100, price: 12, cost: 6 },
    { id: 'c', name: 'C', category: '', qty: 10, price: 30, cost: 8 },
  ]
  const w = whatIf(items, 'b', 22, -0.5)
  assert.equal(w.rowBefore.quadrant, 'plowhorse')
  assert.equal(w.rowAfter.quadrant, 'star')
  near(w.qtyAfter, 100 * Math.pow(22 / 12, -0.5))
  assert.ok(w.deltaTotalCm > 0)
})

test('theoretical vs actual food cost', () => {
  const eng = engineer([{ id: 'a', name: 'A', category: '', qty: 100, price: 20, cost: 6 }])
  const v = variance(eng, { opening: 1000, purchases: 800, closing: 1100 })
  near(v.theoreticalPct, 30)
  near(v.actualPct, 35)
  near(v.gap, 100)
})

test('CSV: quotes, delimiters, BOM, UTF-16', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""x"""\n1,2,3'), [['a', 'b, c', 'd "x"'], ['1', '2', '3']])
  assert.equal(detectDelimiter('Item;Qty;Sales\nSteak;3;"12,50"'), ';')
  assert.equal(detectDelimiter('Item\tQty\nSteak\t3'), '\t')
  const u16 = new Uint8Array([0xff, 0xfe, ...[...'a,b'].flatMap((c) => [c.charCodeAt(0), 0])])
  assert.equal(decodeBytes(u16), 'a,b')
  assert.equal(decodeBytes(new TextEncoder().encode('﻿x,y')), 'x,y')
  assert.equal(toCsv([['a,b', 1.5, 'q"']]), '"a,b",1.50,"q"""')
})

test('number parsing: currency, thousands, decimal comma, negatives', () => {
  assert.equal(parseNumber('$1,234.50'), 1234.5)
  assert.equal(parseNumber('1.234,50 €'), 1234.5)
  assert.equal(parseNumber('12,5'), 12.5)
  assert.equal(parseNumber('1,234'), 1234)
  assert.equal(parseNumber('(12.00)'), -12)
  assert.equal(parseNumber('1 234,5'), 1234.5)
  assert.ok(Number.isNaN(parseNumber('n/a')))
})

test('fuzzy similarity ranks the right item', () => {
  assert.ok(similarity('STEAK FRITES', 'Steak frites') === 1)
  assert.ok(similarity('Moules-Frites', 'Moules frites') === 1)
  assert.ok(similarity('Creme Brulee', 'Crème brûlée') === 1)
  assert.ok(similarity('Roast Chicken', 'Roast chicken jus') > similarity('Roast Chicken', 'Steak tartare'))
})

test('K-Series Product Mix export: detect, skip preamble and totals, match', () => {
  const d = detectSales(sampleProductMixCsv())
  assert.equal(d.format, 'lightspeed-k-product-mix')
  assert.equal(d.headers[d.mapping.revenue], 'Sales (tax excl.)')
  const agg = aggregateSales(d)
  assert.equal(agg.issues.length, 0)
  assert.ok(!agg.items.some((i) => i.posName === 'Total'))
  const data = sampleProject()
  const menu = data.menu.map((m) => ({ ...m, aliases: [] }))
  const m = matchSales(agg.items, menu)
  const steak = m.find((x) => x.sale.posName === 'STEAK FRITES')!
  assert.equal(steak.menuItemId, 'm-steak')
  assert.equal(steak.status, 'exact')
  assert.equal(m.find((x) => x.sale.posName === 'Staff meal')!.status, 'unmatched')
  assert.equal(m.find((x) => x.sale.posName === 'Roast Chicken')!.candidates[0].id, 'm-chicken')
})

test('L-Series receipt items: line-level rows aggregate, voids skipped, semicolons', () => {
  const csv = [
    'Company ID;Receipt ID;Creation Date;Status;Item Name;Amount;Tax Exclusive Price;Total Price;Total Tax Excl. Price;Category',
    '1;100;2026-10-02 19:01;CLOSED;Steak frites;2;29,00;66,68;58,00;Mains',
    '1;101;2026-10-03 19:30;CLOSED;Steak frites;1;29,00;33,34;29,00;Mains',
    '1;102;2026-10-03 20:10;VOIDED;Steak frites;5;29,00;166,70;145,00;Mains',
    '1;103;2026-10-04 12:00;CLOSED;Frites;abc;8,00;9,20;8,00;Sides',
  ].join('\n')
  const d = detectSales(csv)
  assert.equal(d.format, 'lightspeed-l-receipt-items')
  assert.equal(d.headers[d.mapping.qty], 'Amount')
  assert.equal(d.headers[d.mapping.revenue], 'Total Tax Excl. Price')
  const a = aggregateSales(d)
  assert.equal(a.items[0].qty, 3)
  near(a.items[0].revenue, 87)
  assert.equal(a.skipped, 1)
  assert.deepEqual(a.issues.map((i) => i.line), [5])
  assert.equal(a.dates.min, '2026-10-02')
})

test('generic POS CSV with tax-included revenue only is flagged', () => {
  const d = detectSales('Menu Item,Qty Sold,Gross Sales\nBurger,10,"$150.00"')
  assert.equal(d.format, 'generic')
  assert.equal(d.revenueTaxIncluded, true)
  assert.equal(aggregateSales(d).items[0].revenue, 150)
})

test('supplier price import: match by code, diff, apply history, flag new', () => {
  const data = sampleProject()
  const p = parsePriceList(samplePriceListCsv())
  assert.equal(p.issues.length, 0)
  const diff = diffPrices(data.ingredients, p.lines)
  const hanger = diff.rows.find((r) => r.ingredientId === 'hanger')!
  assert.equal(hanger.kind, 'up')
  near(hanger.pct!, ((199 - 168) / 168) * 100)
  assert.equal(diff.rows.find((r) => r.line.code === 'BL-2210')!.kind, 'same')
  assert.equal(diff.rows.find((r) => r.line.code === 'MF-099')!.kind, 'new')
  assert.ok(diff.missing.some((i) => i.id === 'mushroom'))
  const next = applyPrices(data.ingredients, diff, '2026-11-03', 'test.csv')
  const h = next.find((i) => i.id === 'hanger')!
  assert.equal(h.price, 199)
  assert.equal(h.history[h.history.length - 1].price, 199)
  assert.equal(next.find((i) => i.id === 'chicken')!.history.length, data.ingredients.find((i) => i.id === 'chicken')!.history.length)
})

test('pack-size change normalises price to the current pack', () => {
  const i = [ing({ id: 'x', name: 'Butter', packQty: 36, packUnit: 'lb', price: 180 })]
  const d = diffPrices(i, [{ line: 2, name: 'Butter', code: '', price: 100, supplier: '', packQty: 18, packUnit: 'lb' }])
  near(d.rows[0].next!, 200)
  assert.equal(d.rows[0].kind, 'up')
  const d2 = diffPrices(i, [{ line: 2, name: 'Butter', code: '', price: 100, supplier: '', packQty: 8, packUnit: 'kg' }])
  assert.equal(d2.rows[0].kind, 'pack')
})

test('spike alerts list dishes that crossed the target with the driver', () => {
  const before = sampleProject()
  const diff = diffPrices(before.ingredients, parsePriceList(samplePriceListCsv()).lines)
  const after = { ...before, ingredients: applyPrices(before.ingredients, diff, '2026-11-03', 'x') }
  const alerts = spikeAlerts(before, after)
  assert.ok(alerts.length > 0)
  for (const a of alerts) assert.ok(a.after > a.target && a.after > a.before)
  const tartare = alerts.find((a) => a.id === 'm-tartare')
  assert.ok(tartare && tartare.crossed)
  assert.equal(tartare!.driver!.name, 'Hanger steak')
})

test('forecast explodes dishes to prep batches and an order guide', () => {
  const d = sampleProject()
  const f = forecast(d, d.sales[0], d.sales[0].covers / 10)
  near(f.portions.get('m-steak')!, 64)
  const frites = f.prep.find((p) => p.recipe.id === 'r-frites')!
  assert.ok(frites.batches * 5 >= frites.need)
  const demi = f.prep.find((p) => p.recipe.id === 'r-demi')!
  assert.ok(demi.need > 0, 'demi needed via sauce au poivre and dishes')
  const hanger = f.order.find((o) => o.ingredient.id === 'hanger')!
  // 64 steaks * 200 g + 11 tartare * 130 g, grossed up for 88% yield, in kg.
  near(hanger.need, (64 * 0.2 + 11 * 0.13) / 0.88, 1e-6)
  assert.equal(hanger.packs, Math.ceil(hanger.need / 5))
  assert.equal(f.unconvertible.length, 0)
  const order = topoParentsFirst(d.recipes).map((r) => r.id)
  assert.ok(order.indexOf('r-poivre') < order.indexOf('r-demi'))
})

test('snapshot compare reports price moves and quadrant shifts', () => {
  const a = sampleProject()
  const b = { ...a, ingredients: a.ingredients.map((i) => (i.id === 'hanger' ? { ...i, price: i.price * 1.6 } : i)) }
  const c = compare(a, b)
  assert.equal(c.prices[0].name, 'Hanger steak')
  near(c.prices[0].pct, 60)
  const steak = c.items.find((x) => x.id === 'm-steak')!
  assert.ok(steak.costB! > steak.costA!)
  assert.ok(c.b.theoreticalFcPct > c.a.theoreticalFcPct)
})
