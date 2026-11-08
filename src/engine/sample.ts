// Synthetic sample: a neighbourhood bistro. All names, prices and sales are made up for demonstration.
import { toCsv } from './csv.ts'
import type { Ingredient, MenuItem, ProjectData, Recipe, RecipeLine, Unit } from './types.ts'

type I = [id: string, name: string, cat: string, supplier: string, code: string, pu: string, packQty: number, packUnit: Unit, price: number, yieldPct: number, extra?: { d?: number; e?: number }]

const MEAT = 'Boucherie Lavoie'
const SEA = 'Poissonnerie du Port'
const PROD = 'Marché Fraîcheur'
const DRY = 'Distribution Gagnon'
const DAIRY = 'Laiterie Champêtre'

const ING: I[] = [
  ['hanger', 'Hanger steak', 'Meat', MEAT, 'BL-1042', 'case', 5, 'kg', 168, 88],
  ['chicken', 'Chicken thighs, boneless', 'Meat', MEAT, 'BL-2210', 'case', 4, 'kg', 64, 95],
  ['duck', 'Duck legs', 'Meat', MEAT, 'BL-3307', 'case', 12, 'ea', 98, 100, { e: 280 }],
  ['porkbelly', 'Pork belly, skin on', 'Meat', MEAT, 'BL-4120', 'case', 5, 'kg', 74, 90],
  ['bones', 'Veal bones', 'Meat', MEAT, 'BL-9001', 'case', 10, 'kg', 28, 100],
  ['salmon', 'Atlantic salmon fillet', 'Seafood', SEA, 'PP-118', 'case', 3, 'kg', 108, 90],
  ['mussels', 'PEI mussels', 'Seafood', SEA, 'PP-240', 'bag', 5, 'lb', 19.5, 92],
  ['potato', 'Russet potatoes', 'Produce', PROD, 'MF-001', 'bag', 50, 'lb', 32, 82],
  ['onion', 'Yellow onions', 'Produce', PROD, 'MF-004', 'bag', 50, 'lb', 26, 90],
  ['shallot', 'Shallots', 'Produce', PROD, 'MF-011', 'bag', 5, 'lb', 11, 85],
  ['garlic', 'Garlic, peeled', 'Produce', PROD, 'MF-015', 'jar', 1, 'kg', 9.5, 98],
  ['carrot', 'Carrots', 'Produce', PROD, 'MF-020', 'bag', 50, 'lb', 24, 85],
  ['greens', 'Mixed greens', 'Produce', PROD, 'MF-031', 'case', 3, 'lb', 16, 92],
  ['beets', 'Red beets', 'Produce', PROD, 'MF-044', 'bag', 25, 'lb', 20, 80],
  ['mushroom', 'Cremini mushrooms', 'Produce', PROD, 'MF-052', 'case', 5, 'lb', 16, 95],
  ['lemon', 'Lemons', 'Produce', PROD, 'MF-060', 'case', 115, 'ea', 46, 100, { e: 110 }],
  ['herbs', 'Fresh thyme & parsley', 'Produce', PROD, 'MF-071', 'box', 500, 'g', 18, 75],
  ['butter', 'Butter, unsalted', 'Dairy', DAIRY, 'LC-10', 'case', 36, 'lb', 176, 100],
  ['cream', 'Cream 35%', 'Dairy', DAIRY, 'LC-22', 'case', 8, 'l', 42, 100, { d: 1.0 }],
  ['milk', 'Milk 3.25%', 'Dairy', DAIRY, 'LC-25', 'jug', 4, 'l', 7.2, 100, { d: 1.03 }],
  ['eggs', 'Eggs, large', 'Dairy', DAIRY, 'LC-30', 'case', 15, 'dozen', 63, 100, { e: 50 }],
  ['gruyere', 'Gruyère', 'Dairy', DAIRY, 'LC-41', 'wheel cut', 2.5, 'kg', 86, 95],
  ['parmesan', 'Parmigiano Reggiano', 'Dairy', DAIRY, 'LC-42', 'piece', 2, 'kg', 78, 90],
  ['goatcheese', 'Goat cheese log', 'Dairy', DAIRY, 'LC-47', 'log', 1, 'kg', 31, 100],
  ['flour', 'All-purpose flour', 'Dry goods', DRY, 'DG-100', 'bag', 20, 'kg', 24, 100, { d: 0.53 }],
  ['sugar', 'Granulated sugar', 'Dry goods', DRY, 'DG-110', 'bag', 20, 'kg', 30, 100, { d: 0.85 }],
  ['arborio', 'Arborio rice', 'Dry goods', DRY, 'DG-150', 'bag', 5, 'kg', 22, 100],
  ['choc', 'Dark chocolate 70%', 'Dry goods', DRY, 'DG-210', 'box', 2.5, 'kg', 72, 100],
  ['oliveoil', 'Olive oil, extra virgin', 'Dry goods', DRY, 'DG-300', 'tin', 4, 'l', 38, 100, { d: 0.91 }],
  ['canola', 'Canola fryer oil', 'Dry goods', DRY, 'DG-310', 'jug', 16, 'l', 42, 100, { d: 0.92 }],
  ['pepper', 'Black peppercorns', 'Dry goods', DRY, 'DG-401', 'tub', 500, 'g', 14, 100],
  ['salt', 'Kosher salt', 'Dry goods', DRY, 'DG-405', 'box', 1.36, 'kg', 6, 100],
  ['whitewine', 'Cooking white wine', 'Beverage', DRY, 'DG-501', 'box', 4, 'l', 34, 100, { d: 0.99 }],
  ['redwine', 'Cooking red wine', 'Beverage', DRY, 'DG-502', 'box', 4, 'l', 34, 100, { d: 0.99 }],
  ['baguette', 'Baguette', 'Bakery', 'Boulangerie Saint-Roch', 'SR-01', 'case', 24, 'ea', 36, 100, { e: 250 }],
]

// A few months of prior prices so the price history has shape.
const HISTORY: Record<string, number[]> = {
  hanger: [151, 157, 163, 168],
  butter: [160, 164, 171, 176],
  salmon: [114, 112, 110, 108],
  cream: [38, 39, 41, 42],
  eggs: [57, 59, 61, 63],
  potato: [30, 31, 31, 32],
}
const HIST_DATES = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']

const L = (id: string, qty: number, unit: Unit): RecipeLine => ({ ref: { kind: 'ing', id }, qty, unit })
const S = (id: string, qty: number, unit: Unit): RecipeLine => ({ ref: { kind: 'rec', id }, qty, unit })

const SUBS: Recipe[] = [
  { id: 'r-frites', name: 'Pommes frites (blanched)', kind: 'sub', yieldQty: 5, yieldUnit: 'kg', portions: 0,
    lines: [L('potato', 6, 'kg'), L('canola', 400, 'ml'), L('salt', 40, 'g')],
    method: 'Cut 1 cm batons, soak 1 h, blanch at 150 °C for 6 min, cool on racks. Finish to order at 185 °C.' },
  { id: 'r-demi', name: 'Demi-glace', kind: 'sub', yieldQty: 2, yieldUnit: 'l', portions: 0, densityGPerMl: 1.1,
    lines: [L('bones', 5, 'kg'), L('onion', 1, 'kg'), L('carrot', 500, 'g'), L('redwine', 750, 'ml'), L('herbs', 20, 'g')],
    method: 'Roast bones 220 °C until deep brown. Sweat mirepoix, deglaze with wine, cover with water, simmer 10 h. Strain and reduce to nappe.' },
  { id: 'r-poivre', name: 'Sauce au poivre', kind: 'sub', yieldQty: 1, yieldUnit: 'l', portions: 0, densityGPerMl: 1.05,
    lines: [S('r-demi', 500, 'ml'), L('cream', 500, 'ml'), L('shallot', 100, 'g'), L('pepper', 30, 'g'), L('butter', 60, 'g')],
    method: 'Crack peppercorns, sweat with shallot in butter, add demi-glace and cream, reduce by a third.' },
  { id: 'r-blanc', name: 'Beurre blanc', kind: 'sub', yieldQty: 750, yieldUnit: 'ml', portions: 0, densityGPerMl: 0.95,
    lines: [L('shallot', 80, 'g'), L('whitewine', 300, 'ml'), L('cream', 100, 'ml'), L('butter', 1, 'lb'), L('lemon', 1, 'ea')],
    method: 'Reduce shallot and wine au sec, add cream, mount cold butter off the heat. Hold at 60 °C, max 4 h.' },
  { id: 'r-vinaigrette', name: 'House vinaigrette', kind: 'sub', yieldQty: 1, yieldUnit: 'l', portions: 0, densityGPerMl: 0.93,
    lines: [L('oliveoil', 750, 'ml'), L('shallot', 60, 'g'), L('lemon', 3, 'ea'), L('salt', 10, 'g'), L('herbs', 10, 'g')],
    method: 'Macerate shallot in lemon and salt 10 min, whisk in oil, finish with chopped herbs.' },
  { id: 'r-brisee', name: 'Pâte brisée', kind: 'sub', yieldQty: 800, yieldUnit: 'g', portions: 0,
    lines: [L('flour', 500, 'g'), L('butter', 250, 'g'), L('eggs', 1, 'ea'), L('salt', 5, 'g')],
    method: 'Rub cold butter into flour, bind with egg and 60 ml ice water. Rest 2 h before rolling.' },
]

const dish = (id: string, name: string, lines: RecipeLine[], portions = 1, method?: string): Recipe => ({
  id, name, kind: 'dish', yieldQty: portions, yieldUnit: 'portion', portions, lines, method,
})

const DISHES: Recipe[] = [
  dish('d-steak', 'Steak frites', [L('hanger', 200, 'g'), S('r-frites', 250, 'g'), S('r-poivre', 60, 'ml'), L('greens', 20, 'g'), S('r-vinaigrette', 10, 'ml')], 1,
    'Season and sear hanger to medium-rare, rest 5 min, slice against the grain. Fry frites to order. Sauce on the side.'),
  dish('d-moules', 'Moules frites', [L('mussels', 450, 'g'), L('whitewine', 80, 'ml'), L('shallot', 20, 'g'), L('cream', 60, 'ml'), L('butter', 20, 'g'), S('r-frites', 200, 'g'), L('baguette', 0.25, 'ea')]),
  dish('d-duck', 'Duck confit', [L('duck', 1, 'ea'), L('potato', 200, 'g'), L('garlic', 10, 'g'), L('greens', 30, 'g'), S('r-vinaigrette', 10, 'ml')]),
  dish('d-salmon', 'Salmon, beurre blanc', [L('salmon', 170, 'g'), S('r-blanc', 60, 'ml'), L('potato', 150, 'g'), L('carrot', 80, 'g')]),
  dish('d-chicken', 'Roast chicken jus', [L('chicken', 250, 'g'), S('r-demi', 60, 'ml'), L('potato', 180, 'g'), L('carrot', 80, 'g'), L('butter', 15, 'g')]),
  dish('d-pork', 'Crispy pork belly', [L('porkbelly', 220, 'g'), S('r-demi', 50, 'ml'), L('beets', 120, 'g'), L('butter', 10, 'g')]),
  dish('d-risotto', 'Mushroom risotto', [L('arborio', 90, 'g'), L('mushroom', 120, 'g'), L('parmesan', 25, 'g'), L('butter', 20, 'g'), L('whitewine', 50, 'ml'), L('shallot', 20, 'g')]),
  dish('d-soup', 'French onion soup', [L('onion', 3, 'kg'), S('r-demi', 1.5, 'l'), L('baguette', 1.5, 'ea'), L('gruyere', 500, 'g'), L('butter', 150, 'g'), L('redwine', 300, 'ml')], 10,
    'Caramelise onions low and slow 90 min. Deglaze, add demi-glace and 1 L water, simmer 30 min. Portion, top with croûton and Gruyère, gratinée.'),
  dish('d-bistro', 'Salade lyonnaise', [L('greens', 80, 'g'), S('r-vinaigrette', 25, 'ml'), L('eggs', 1, 'ea'), L('porkbelly', 40, 'g')]),
  dish('d-beet', 'Beet & goat cheese salad', [L('beets', 150, 'g'), L('goatcheese', 40, 'g'), L('greens', 40, 'g'), S('r-vinaigrette', 20, 'ml')]),
  dish('d-tartare', 'Steak tartare', [L('hanger', 130, 'g'), L('shallot', 15, 'g'), L('eggs', 1, 'ea'), L('baguette', 0.3, 'ea'), L('herbs', 3, 'g')]),
  dish('d-croque', 'Croque monsieur', [L('baguette', 0.5, 'ea'), L('gruyere', 70, 'g'), L('butter', 20, 'g'), L('milk', 80, 'ml'), L('flour', 10, 'g'), L('greens', 20, 'g')]),
  dish('d-quiche', 'Quiche lorraine', [S('r-brisee', 120, 'g'), L('eggs', 2, 'ea'), L('cream', 80, 'ml'), L('porkbelly', 40, 'g'), L('gruyere', 30, 'g'), L('greens', 30, 'g'), S('r-vinaigrette', 10, 'ml')]),
  dish('d-sidefrites', 'Frites', [S('r-frites', 220, 'g'), L('salt', 2, 'g')]),
  dish('d-mousse', 'Chocolate mousse', [L('choc', 720, 'g'), L('eggs', 24, 'ea'), L('cream', 720, 'ml'), L('sugar', 180, 'g')], 12),
  dish('d-tarte', 'Tarte au citron', [S('r-brisee', 80, 'g'), L('lemon', 1, 'ea'), L('eggs', 1.5, 'ea'), L('sugar', 50, 'g'), L('butter', 40, 'g')]),
  dish('d-brulee', 'Crème brûlée', [L('cream', 150, 'ml'), L('eggs', 2, 'ea'), L('sugar', 35, 'g'), L('milk', 30, 'ml')]),
  dish('d-cheese', 'Cheese plate', [L('gruyere', 40, 'g'), L('parmesan', 30, 'g'), L('goatcheese', 30, 'g'), L('baguette', 0.3, 'ea')]),
]

type M = [recipe: string, name: string, cat: string, price: number, posName: string, sold: number]
const MENU: M[] = [
  ['d-steak', 'Steak frites', 'Mains', 29, 'STEAK FRITES', 640],
  ['d-moules', 'Moules frites', 'Mains', 24, 'Moules-Frites', 410],
  ['d-duck', 'Duck confit', 'Mains', 31, 'Duck Confit', 205],
  ['d-salmon', 'Salmon, beurre blanc', 'Mains', 30, 'Salmon Beurre Blanc', 300],
  ['d-chicken', 'Roast chicken jus', 'Mains', 26, 'Roast Chicken', 385],
  ['d-pork', 'Crispy pork belly', 'Mains', 28, 'Pork Belly', 120],
  ['d-risotto', 'Mushroom risotto', 'Mains', 23, 'Risotto Champignons', 165],
  ['d-soup', 'French onion soup', 'Starters', 14, 'Soupe a l oignon', 350],
  ['d-bistro', 'Salade lyonnaise', 'Starters', 15, 'Salade Lyonnaise', 190],
  ['d-beet', 'Beet & goat cheese salad', 'Starters', 16, 'Beet Goat Cheese Salad', 95],
  ['d-tartare', 'Steak tartare', 'Starters', 22, 'Tartare de boeuf', 110],
  ['d-croque', 'Croque monsieur', 'Mains', 18, 'Croque Monsieur', 260],
  ['d-quiche', 'Quiche lorraine', 'Mains', 17, 'Quiche', 80],
  ['d-sidefrites', 'Frites', 'Sides', 8, 'Side Frites', 420],
  ['d-mousse', 'Chocolate mousse', 'Desserts', 11, 'Mousse au Chocolat', 240],
  ['d-tarte', 'Tarte au citron', 'Desserts', 12, 'Tarte Citron', 85],
  ['d-brulee', 'Crème brûlée', 'Desserts', 11, 'Creme Brulee', 280],
  ['d-cheese', 'Cheese plate', 'Desserts', 19, 'Fromages', 70],
]

const MODS: Record<string, MenuItem['modifiers']> = {
  'd-steak': [{ id: 'mod-poivre', name: 'Extra sauce au poivre', price: 3, attachPct: 25, lines: [S('r-poivre', 40, 'ml')] }],
  'd-croque': [{ id: 'mod-madame', name: 'Make it Madame (fried egg)', price: 2.5, attachPct: 40, lines: [L('eggs', 1, 'ea'), L('butter', 5, 'g')] }],
  'd-sidefrites': [{ id: 'mod-truffle', name: 'Parmesan & herbs', price: 3, attachPct: 30, lines: [L('parmesan', 10, 'g'), L('herbs', 2, 'g')] }],
}

export const SAMPLE_COVERS = 2950

function ingredients(): Ingredient[] {
  return ING.map(([id, name, category, supplier, code, purchaseUnit, packQty, packUnit, price, yieldPct, x]) => ({
    id, name, category, supplier, code, purchaseUnit, packQty, packUnit, price, yieldPct,
    densityGPerMl: x?.d, eachG: x?.e,
    history: (HISTORY[id] ?? [price]).map((p, i, a) => ({ date: a.length === 1 ? '2026-10-01' : HIST_DATES[i], price: p, source: a.length === 1 ? 'Initial price' : `${supplier} invoice` })),
  }))
}

/** Deterministic small wobble so sample revenue is not a perfect multiple of price. */
function wobble(i: number) {
  return 0.955 + ((i * 37) % 11) / 400
}

export function sampleProject(): ProjectData {
  const menu: MenuItem[] = MENU.map(([recipeId, name, category, price, pos]) => ({
    id: 'm' + recipeId.slice(1), name, category, recipeId, price, modifiers: MODS[recipeId] ?? [], aliases: [pos],
  }))
  return {
    restaurant: 'Bistro Mirabel (sample)',
    synthetic: true,
    settings: { currency: 'CAD', targetFcPct: 30, elasticity: -0.8, popularityFactor: 0.7 },
    ingredients: ingredients(),
    recipes: [...SUBS, ...DISHES],
    menu,
    sales: [{
      id: 'sales-2026-10', label: '2026-10', source: 'Lightspeed K-Series Product Mix (synthetic)', covers: SAMPLE_COVERS, importedAt: '2026-11-01T09:00:00.000Z',
      rows: MENU.map(([r, , , price, , sold], i) => ({ menuItemId: 'm' + r.slice(1), qty: sold, revenue: Math.round(sold * price * wobble(i) * 100) / 100 })),
    }],
    actuals: [{ periodId: 'sales-2026-10', opening: 11840, purchases: 24720, closing: 12160 }],
    priceImports: [],
  }
}

/** A Product Mix style export (K-Series column names) for the sample month, with POS names that differ from menu names. */
export function sampleProductMixCsv(): string {
  const groups: Record<string, string> = { Mains: 'Food - Mains', Starters: 'Food - Starters', Sides: 'Food - Sides', Desserts: 'Food - Desserts' }
  const head = ['Item name', 'Accounting group', 'Quantity', 'Sales (tax incl.)', 'Tax', 'Sales (tax excl.)', 'Zero priced count', 'Discounted amount', 'Discounted quantity', 'Costs']
  const rows: (string | number)[][] = MENU.map(([, , cat, price, pos, sold], i) => {
    const net = Math.round(sold * price * wobble(i) * 100) / 100
    const tax = Math.round(net * 0.14975 * 100) / 100
    return [pos, groups[cat], sold, net + tax, tax, net, i % 5 === 0 ? 2 : 0, Math.round(sold * price * 0.02 * 100) / 100, Math.round(sold * 0.03), 0]
  })
  // Unknown to the menu: a seasonal special and a staff meal line.
  rows.push(['Special du jour - Bouillabaisse', 'Food - Mains', 42, 1497.3, 195.3, 1302, 0, 0, 0, 0])
  rows.push(['Staff meal', 'Food - Mains', 61, 0, 0, 0, 61, 0, 0, 0])
  const total = rows.reduce((s, r) => s + (r[2] as number), 0)
  return ['Product Mix Report', 'Bistro Mirabel,2026-10-01 - 2026-10-31', '', toCsv([head, ...rows, ['Total', '', total, '', '', '', '', '', '', '']])].join('\n')
}

/** A supplier price list for November with a beef and butter spike. */
export function samplePriceListCsv(): string {
  return toCsv([
    ['Vendor', 'Item #', 'Description', 'Pack', 'UOM', 'Case Price', 'Invoice Date'],
    [MEAT, 'BL-1042', 'HANGER STEAK AAA', 5, 'kg', 199, '2026-11-03'],
    [MEAT, 'BL-2210', 'CHICKEN THIGH BNLS', 4, 'kg', 64, '2026-11-03'],
    [MEAT, 'BL-3307', 'DUCK LEG CONFIT GRADE', 12, 'ea', 104, '2026-11-03'],
    [MEAT, 'BL-4120', 'PORK BELLY SKIN ON', 5, 'kg', 79, '2026-11-03'],
    [MEAT, 'BL-9001', 'VEAL BONES', 10, 'kg', 28, '2026-11-03'],
    [DAIRY, 'LC-10', 'BUTTER UNSALTED 1LB', 36, 'lb', 205, '2026-11-03'],
    [DAIRY, 'LC-22', 'CREAM 35% 2L', 8, 'l', 44.5, '2026-11-03'],
    [DAIRY, 'LC-30', 'EGGS LARGE 15DZ', 15, 'dozen', 63, '2026-11-03'],
    [SEA, 'PP-118', 'SALMON FILLET ATL', 3, 'kg', 104, '2026-11-03'],
    [SEA, 'PP-240', 'MUSSELS PEI 5LB', 5, 'lb', 23.5, '2026-11-03'],
    [PROD, 'MF-060', 'LEMONS 115CT', 115, 'ea', 52, '2026-11-03'],
    [PROD, 'MF-099', 'ENDIVE BELGIAN', 10, 'lb', 31, '2026-11-03'],
  ])
}

export function emptyProject(name: string): ProjectData {
  return {
    restaurant: name,
    settings: { currency: 'CAD', targetFcPct: 30, elasticity: -0.8, popularityFactor: 0.7 },
    ingredients: [], recipes: [], menu: [], sales: [], actuals: [], priceImports: [],
  }
}
