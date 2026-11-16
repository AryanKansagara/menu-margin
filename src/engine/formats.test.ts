// Fixtures are short excerpts written to match the published layouts of each export (headers verbatim, values made up).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateSales, detectSales, isoDates } from './sales.ts'
import { diffPrices, parsePack, parsePriceList } from './prices.ts'
import { refDensity, refEach } from './reference.ts'
import { respond } from './engineering.ts'
import { sampleProductMixCsv } from './sample.ts'
import type { Ingredient } from './types.ts'

// Toast AllItemsReport.csv header, per doc.toasttab.com data export field reference.
const TOAST_ALL_ITEMS = `Master ID,Item ID,Parent ID,Menu Name,Menu Group,Subgroup,Menu Item,Avg Price,Item Qty (incl voids),% of Ttl Qty (incl voids),Gross Amount (incl voids),% of Ttl Amt (incl voids),Item Qty,Gross Amount,Void Qty,Void Amount,Discount Amount,Net Amount,# Orders,% of Ttl # Orders,% Qty (Group),% Qty (Menu),% Qty (All),% Net Amt (Group),% Net Amt (Menu),% Net Amt (All)
400000001,400000101,,Dinner,Mains,,Steak Frites,29.00,66,10.2,1914.00,12.1,64,1856.00,2,58.00,29.00,1827.00,61,9.8,30.1,12.0,9.9,31.0,12.3,11.6
400000002,400000102,,Dinner,Mains,,Roast Chicken,24.00,40,6.2,960.00,6.1,40,960.00,0,0.00,0.00,960.00,39,6.3,18.8,7.5,6.2,16.3,6.5,6.1`

// Toast ItemSelectionDetails.csv header, same source.
const TOAST_DETAILS = `Location,Order Id,Order #,Sent Date,Order Date,Check Id,Server,Table,Dining Area,Service,Dining Option,Item Selection Id,Item Id,Master Id,SKU,Menu Item,Menu Subgroup(s),Menu Group,Menu,Sales Category,Gross Price,Discnt,Net Price,Qty,Tax,Void?,Deferred,Tax Exempt,Tax Inclusion Option,Dining Option Tax,Tab Name
Bistro,1001,12,10/2/26 7:05 PM,10/2/26 6:58 PM,2001,Ana,12,Main,Dinner,Dine In,3001,400000101,400000101,,Steak Frites,,Mains,Dinner,Food,58.00,0.00,58.00,2,8.68,False,False,False,NOT_INCLUDED,,
Bistro,1002,13,10/2/26 7:10 PM,10/2/26 7:01 PM,2002,Ana,14,Main,Dinner,Dine In,3002,400000101,400000101,,Steak Frites,,Mains,Dinner,Food,29.00,0.00,29.00,1,4.34,True,False,False,NOT_INCLUDED,,
Bistro,1003,14,10/31/26 9:10 PM,10/31/26 9:01 PM,2003,Ana,14,Main,Dinner,Dine In,3003,400000102,400000102,,Roast Chicken,,Mains,Dinner,Food,24.00,2.40,21.60,1,3.24,False,False,False,NOT_INCLUDED,,`

// Square Item Sales detail CSV (Reports > Item Sales > Export > Detail CSV).
const SQUARE = `Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,Itemization Type
2026-10-02,19:01:12,Eastern Time (US & Canada),Mains,Steak Frites,2,Regular,,,$58.00,$0.00,$58.00,$8.68,abc,def,iPad,,,Payment,Bistro,For Here,,,,,,Physical Item
2026-10-03,19:30:00,Eastern Time (US & Canada),Mains,Steak Frites,1,Regular,,,$29.00,-$2.90,$26.10,$3.91,abd,deg,iPad,,,Payment,Bistro,For Here,,,,,,Physical Item
2026-10-04,12:00:00,Eastern Time (US & Canada),Mains,Steak Frites,-1,Regular,,,-$29.00,$0.00,-$29.00,-$4.34,abd,deh,iPad,,,Refund,Bistro,For Here,,,,,,Physical Item`

test('Toast All items export: uses Item Qty, never the incl-voids count', () => {
  const d = detectSales(TOAST_ALL_ITEMS)
  assert.equal(d.format, 'toast-pmix')
  assert.equal(d.headers[d.mapping.qty], 'Item Qty')
  assert.equal(d.headers[d.mapping.revenue], 'Net Amount')
  assert.equal(d.mapping.status, -1, 'Void Qty is an amount, not a void flag')
  const a = aggregateSales(d)
  assert.deepEqual(a.items.map((i) => [i.posName, i.qty, i.revenue]), [['Steak Frites', 64, 1827], ['Roast Chicken', 40, 960]])
})

test('Toast ItemSelectionDetails: Void? rows skipped, US dates read month-first', () => {
  const d = detectSales(TOAST_DETAILS)
  assert.equal(d.format, 'toast-item-details')
  assert.equal(d.headers[d.mapping.status], 'Void?')
  assert.equal(d.headers[d.mapping.date], 'Order Date')
  const a = aggregateSales(d)
  assert.equal(a.skipped, 1)
  assert.equal(a.items.find((i) => i.posName === 'Steak Frites')!.qty, 2)
  assert.equal(a.items.find((i) => i.posName === 'Roast Chicken')!.revenue, 21.6)
  assert.deepEqual(a.dates, { min: '2026-10-02', max: '2026-10-31' })
})

test('Square detail CSV: refunds net out and money rounds to cents', () => {
  const d = detectSales(SQUARE)
  assert.equal(d.format, 'square-item-details')
  assert.equal(d.headers[d.mapping.revenue], 'Net Sales')
  const [steak] = aggregateSales(d).items
  assert.equal(steak.qty, 2)
  assert.equal(steak.revenue, 55.1)
})

test('K-Series sample carries all 21 documented Product Mix columns', () => {
  const d = detectSales(sampleProductMixCsv())
  assert.equal(d.headers.length, 21)
  assert.deepEqual([d.headers[0], d.headers[7], d.headers[20]], ['Item name', 'Transaction amount (tax incl.)', 'Service charge'])
  assert.equal(d.headers[d.mapping.revenue], 'Sales (tax excl.)')
})

test('isoDates: ISO, US month-first, day-first when a day exceeds 12, dotted European', () => {
  assert.deepEqual(isoDates(['2026-10-02 19:01', '10/2/26 7:05 PM']), ['2026-10-02', '2026-10-02'])
  assert.deepEqual(isoDates(['02/10/2026 19:01', '25/10/2026 12:00']), ['2026-10-02', '2026-10-25'])
  assert.deepEqual(isoDates(['02.10.2026']), ['2026-10-02'])
  assert.deepEqual(isoDates(['n/a', '13/13/2026']), [])
})

test('parsePack reads foodservice pack notation', () => {
  assert.deepEqual(parsePack('6/5 LB'), { qty: 30, unit: 'lb' })
  assert.deepEqual(parsePack('4/1 GAL'), { qty: 4, unit: 'gal' })
  assert.deepEqual(parsePack('12/32 OZ'), { qty: 384, unit: 'oz' })
  assert.deepEqual(parsePack('2/5#'), { qty: 10, unit: '#' })
  assert.deepEqual(parsePack('6x2kg'), { qty: 12, unit: 'kg' })
  assert.deepEqual(parsePack('10 LB AVG'), { qty: 10, unit: 'lb' })
  assert.deepEqual(parsePack('36'), { qty: 36, unit: undefined })
  assert.equal(parsePack('6/#10'), null)
})

const ing = (o: Partial<Ingredient> & { id: string }): Ingredient => ({
  name: o.id, category: '', supplier: '', purchaseUnit: 'case', packQty: 1, packUnit: 'kg', price: 10, yieldPct: 100, history: [], ...o,
})

test('distributor order guide: Pack x Size, Case $ price, CS unit falls back to pack text', () => {
  const csv = [
    'SUPC,Pack,Size,Unit,Brand,Desc,Case $,Split $',
    '1234567,6,5 LB,CS,Packer,ONION YELLOW JUMBO,41.95,',
    '7654321,4,1 GAL,CS,Imperial,OIL CANOLA FRY,54.20,14.10',
  ].join('\n')
  const p = parsePriceList(csv)
  assert.equal(p.issues.length, 0)
  assert.equal(p.headers[p.mapping.price], 'Case $')
  assert.equal(p.headers[p.mapping.code], 'SUPC')
  assert.equal(p.lines[0].name, 'ONION YELLOW JUMBO')
  assert.deepEqual(p.lines.map((l) => [l.packQty, l.packUnit, l.price]), [[30, 'lb', 41.95], [4, 'gal', 54.2]])
  // Same 30 lb case as the ingredient: a straight price comparison.
  const d = diffPrices([ing({ id: 'on', name: 'Onion yellow jumbo', code: '1234567', packQty: 30, packUnit: 'lb', price: 38 })], p.lines.slice(0, 1))
  assert.equal(d.rows[0].kind, 'up')
  assert.equal(d.rows[0].next, 41.95)
})

test('USDA reference densities and each-weights, without false friends', () => {
  assert.equal(refDensity('All-purpose flour')!.value, 0.528) // 125 g per cup, FDC 168894
  assert.equal(refDensity('Butter, unsalted')!.fdcId, 173430)
  assert.equal(refEach('Eggs, large')!.value, 50)
  assert.equal(refDensity('Peanut butter'), undefined)
  assert.equal(refEach('Lemon juice'), undefined)
  assert.equal(refDensity('Hanger steak'), undefined)
})

test('elasticity example in the docs: +10% at e = -0.8 keeps 92.7% of orders', () => {
  assert.equal(Math.round(respond(1000, 10, 11, -0.8)), 927)
})
