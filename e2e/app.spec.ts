import type { Page } from '@playwright/test'
import { csv, expect, openSample, openTab, storedProject, test } from './fixtures'

// All data here is synthetic: the sample bistro ships with the app, the files below are made up.

/** The "Plate cost" cell of a Menu row. */
const plateCost = (page: Page, dish: string) =>
  page.getByRole('row').filter({ has: page.getByLabel(`Price of ${dish}`) }).locator('td.num').first()

/** The cost shown for a recipe in the Recipes list. */
const recipeCost = (page: Page, name: string) =>
  page.locator('a.ritem').filter({ has: page.getByText(name, { exact: true }) }).locator('.num')

/** Open the editor for an ingredient and set its price. */
async function setIngredientPrice(page: Page, name: string, price: number) {
  await openTab(page, /^Ingredients/)
  await page.getByRole('row').filter({ hasText: name }).first().click()
  const editor = page.getByRole('dialog', { name })
  await editor.getByLabel('Price', { exact: true }).fill(String(price))
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

test.describe('sample bistro', () => {
  test('shows plate cost and a menu-engineering class', async ({ page }) => {
    await openSample(page)

    await openTab(page, /^Menu/)
    await expect(plateCost(page, 'Steak frites')).toHaveText('$9.19')
    await expect(plateCost(page, 'Frites')).toHaveText('$0.52')

    await openTab(page, /^Engineering/)
    await expect(page.getByRole('heading', { level: 1, name: 'Menu engineering' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Steak frites' }).locator('.qpill')).toHaveText('Star')
    await expect(page.getByRole('row').filter({ hasText: 'Cheese plate' }).locator('.qpill')).toHaveText('Dog')
    // The four class counts add up to the 18 dishes on the menu.
    await expect(page.locator('.qcounts')).toContainText('Star5')
    await expect(page.locator('.qcounts')).toContainText('Plowhorse6')
    await expect(page.locator('.qcounts')).toContainText('Puzzle3')
    await expect(page.locator('.qcounts')).toContainText('Dog4')
  })
})

test.describe('editing prices', () => {
  test('a new ingredient price changes the cost of recipes that use it, and only those', async ({ page }) => {
    await openSample(page)
    await openTab(page, /^Recipes/)
    await expect(recipeCost(page, 'Steak frites')).toHaveText('$9.19')
    await expect(recipeCost(page, 'Steak tartare')).toHaveText('$5.99')
    await expect(recipeCost(page, 'Duck confit')).toHaveText('$9.08')

    // Hanger steak: $168 → $336 per 5 kg case, 88% usable yield: +$0.0764 per gram.
    // Steak frites uses 200 g (+$7.64), steak tartare 130 g (+$4.97).
    await setIngredientPrice(page, 'Hanger steak', 336)

    await openTab(page, /^Recipes/)
    const steak = recipeCost(page, 'Steak frites')
    await expect(steak).not.toHaveText('$9.19')
    await expect(steak).toHaveText('$16.83')
    await expect(recipeCost(page, 'Steak tartare')).toHaveText('$10.96')
    await expect(recipeCost(page, 'Duck confit')).toHaveText('$9.08') // does not use hanger steak

    await openTab(page, /^Menu/)
    await expect(plateCost(page, 'Steak frites')).toHaveText('$16.83')
  })

  test('undo restores the previous price', async ({ page }) => {
    await openSample(page)
    await setIngredientPrice(page, 'Hanger steak', 336)
    await openTab(page, /^Menu/)
    await expect(plateCost(page, 'Steak frites')).toHaveText('$16.83')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(plateCost(page, 'Steak frites')).toHaveText('$9.19')
  })
})

test.describe('persistence', () => {
  test('an edited price is still there after a reload', async ({ page }) => {
    await openSample(page)
    await setIngredientPrice(page, 'Hanger steak', 336)
    await openTab(page, /^Menu/)
    await expect(plateCost(page, 'Steak frites')).toHaveText('$16.83')

    // Saving is debounced; wait until the new price is really in IndexedDB rather than sleeping.
    await expect
      .poll(async () => (await storedProject(page))?.data.ingredients.find((i) => i.id === 'hanger')?.price)
      .toBe(336)

    await page.reload()
    await expect(plateCost(page, 'Steak frites')).toHaveText('$16.83')
    await openTab(page, /^Ingredients/)
    await expect(page.getByRole('row').filter({ hasText: 'Hanger steak' }).locator('td.num').first()).toHaveText('$336.00')
  })

  test('projects stay in the workspace after a reload', async ({ page }) => {
    await page.goto('/app')
    await page.getByRole('button', { name: 'New project' }).first().click()
    await page.getByLabel('Restaurant or concept name').fill('Test Kitchen')
    await page.getByRole('button', { name: 'Create project' }).click()
    await page.waitForURL(/\/app\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Test Kitchen' })).toBeVisible()

    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Test Kitchen' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Test Kitchen' })).toBeVisible()
    await page.getByRole('link', { name: /Test Kitchen/ }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test Kitchen' })).toBeVisible()
  })
})

const PRICE_LIST = `Vendor,Item #,Description,Pack,UOM,Case Price,Invoice Date
Test Meats,BL-1042,HANGER STEAK AAA,5,kg,190,2026-11-03
Test Dairy,LC-10,BUTTER UNSALTED 1LB,36,lb,150,2026-11-03
Test Meats,BL-2210,CHICKEN THIGH BNLS,4,kg,64,2026-11-03
Test Pantry,ZZ-900,SMOKED PAPRIKA TIN,1,kg,21,2026-11-03
`

const POS_EXPORT = `Item Name,Quantity,Net Sales,Date
STEAK FRITES,120,3300.00,2026-09-05
Moules-Frites,80,1850.00,2026-09-05
Roast Chicken,60,1500.00,2026-09-06
Steak Frite,20,540.00,2026-09-06
Staff meal,15,0,2026-09-06
`

test.describe('imports', () => {
  test('a supplier price list updates prices, keeps history and reports what moved', async ({ page }) => {
    await openSample(page)
    await openTab(page, /^Price imports/)
    await page.locator('input[type=file]').setInputFiles(csv('synthetic-prices.csv', PRICE_LIST))

    await expect(page.getByText('synthetic-prices.csv · 4 priced lines')).toBeVisible()
    const report = page.locator('.report')
    await expect(report.locator('div').filter({ hasText: 'price increases' })).toContainText('1')
    await expect(report.locator('div').filter({ hasText: 'decreases' })).toContainText('1')
    await expect(report.locator('div').filter({ hasText: 'unchanged' })).toContainText('1')
    await expect(report.locator('div').filter({ hasText: 'not matched' })).toContainText('1')
    await expect(page.getByRole('row').filter({ hasText: 'HANGER STEAK AAA' })).toContainText('$168.00')
    await expect(page.getByRole('row').filter({ hasText: 'HANGER STEAK AAA' })).toContainText('$190.00')

    await page.getByRole('button', { name: /^Apply 2 price changes/ }).click()
    await expect(page.getByRole('status')).toContainText('2 prices updated')
    await expect(page.getByRole('heading', { name: /Test Meats|Test Dairy/ })).toBeVisible()

    await openTab(page, /^Ingredients/)
    const row = (n: string) => page.getByRole('row').filter({ hasText: n }).first().locator('td.num').first()
    await expect(row('Hanger steak')).toHaveText('$190.00')
    await expect(row('Butter, unsalted')).toHaveText('$150.00')
    await expect(row('Chicken thighs')).toHaveText('$64.00')

    await openTab(page, /^Recipes/)
    await expect(recipeCost(page, 'Steak frites')).not.toHaveText('$9.19')
  })

  test('a POS export is matched to menu items and saved as a sales period', async ({ page }) => {
    await openSample(page)
    await openTab(page, /^Sales/)
    await page.getByRole('button', { name: /Import sales/ }).first().click()
    await page.locator('input[type=file]').setInputFiles(csv('synthetic-pos.csv', POS_EXPORT))

    await expect(page.getByText('Generic POS item-sales CSV')).toBeVisible()
    const report = page.locator('.report')
    await expect(report.locator('div').filter({ hasText: 'distinct items' })).toContainText('5')
    await expect(report.locator('div').filter({ hasText: 'units sold' })).toContainText('295')
    await page.getByRole('button', { name: /^Match 5 items/ }).click()

    // Two exact (aliases), a menu-name match, one close match to confirm, one unknown line.
    await expect(page.getByText(/3 exact · 1 close matches to confirm · 1 unmatched/)).toBeVisible()
    await page.getByRole('button', { name: /Confirm 1 close matches/ }).click()
    await page.getByLabel('Menu item for Staff meal').selectOption('__ignore')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByLabel('Period label')).toHaveValue('2026-09')
    await page.getByRole('button', { name: 'Save sales period' }).click()
    await expect(page.getByRole('status')).toContainText('Imported 280 items sold for 2026-09')

    await expect(page.getByRole('heading', { level: 2, name: '2026-09' })).toBeVisible()
    await expect(page.getByLabel('Sales period')).toHaveValue(/sales-/)
    await page.getByLabel('Sales period').selectOption({ label: '2026-09' })
    await openTab(page, /^Engineering/)
    await expect(page.getByText(/2026-09 · 280 items sold/)).toBeVisible()
  })
})

test.describe('files the app cannot use', () => {
  const unusable: [string, Buffer][] = [
    ['empty', Buffer.alloc(0)],
    ['a PNG renamed .csv', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.alloc(40, 7)])],
    ['prose', Buffer.from('Hello, this is not a spreadsheet.\nJust a note to myself.\n')],
    ['JSON', Buffer.from('{"hello": "world"}')],
    ['a table with unrelated columns', Buffer.from('a,b,c\n1,2,3\n4,5,6\n')],
  ]

  for (const [what, buffer] of unusable) {
    test(`sales importer explains ${what} and stays usable`, async ({ page }) => {
      await openSample(page)
      await openTab(page, /^Sales/)
      await page.getByRole('button', { name: /Import sales/ }).first().click()
      await page.locator('input[type=file]').setInputFiles({ name: 'unusable.csv', mimeType: 'text/csv', buffer })

      const issues = page.locator('.issues-list')
      await expect(issues).toContainText('No item-name column mapped')
      await expect(issues).toContainText('No quantity column mapped')
      await expect(page.locator('.report').locator('div').filter({ hasText: 'distinct items' })).toContainText('0')
      // Nothing can be saved from this file.
      await expect(page.getByRole('button', { name: /^Match 0 items/ })).toBeDisabled()

      // The app is still usable: pick a good file instead and finish an import.
      await page.getByRole('button', { name: 'Choose another file' }).click()
      await page.locator('input[type=file]').setInputFiles(csv('synthetic-pos.csv', POS_EXPORT))
      await expect(page.getByText('Generic POS item-sales CSV')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Match 5 items/ })).toBeEnabled()
    })

    test(`price importer explains ${what} and stays usable`, async ({ page }) => {
      await openSample(page)
      await openTab(page, /^Price imports/)
      await page.locator('input[type=file]').setInputFiles({ name: 'unusable.csv', mimeType: 'text/csv', buffer })

      await expect(page.getByText('unusable.csv · 0 priced lines · 2 problems')).toBeVisible()
      const issues = page.locator('.issues-list')
      await expect(issues).toContainText('Map a description or item-code column')
      await expect(issues).toContainText('Map a price column')
      await expect(page.getByRole('button', { name: /^Apply 0 price changes/ })).toBeDisabled()

      // Nothing changed, and a good file still imports afterwards.
      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.locator('input[type=file]').setInputFiles(csv('synthetic-prices.csv', PRICE_LIST))
      await expect(page.getByText('synthetic-prices.csv · 4 priced lines')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Apply 2 price changes/ })).toBeEnabled()
    })
  }

  test('a file over 25 MB is refused with a message', async ({ page }) => {
    await openSample(page)
    await openTab(page, /^Sales/)
    await page.getByRole('button', { name: /Import sales/ }).first().click()
    await page.locator('input[type=file]').setInputFiles({ name: 'huge.csv', mimeType: 'text/csv', buffer: Buffer.alloc(25_000_001, 'a') })
    await expect(page.getByRole('status')).toContainText('over 25 MB')
    await expect(page.getByText('Drop a POS item-sales export')).toBeVisible()
  })

  test('restoring something that is not a backup says so and keeps existing projects', async ({ page }) => {
    await openSample(page)
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Bistro Mirabel (sample)' })).toBeVisible()
    await page.getByRole('button', { name: /Restore backup/ }).click()
    await page.locator('dialog input[type=file]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": "world"}') })
    await expect(page.getByRole('status')).toContainText('Not a Menu Margin backup')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Bistro Mirabel (sample)' })).toBeVisible()
  })
})

test('the app makes no requests to anything but its own origin and the font CDN', async ({ page }) => {
  // The `guard` fixture blocks all external traffic and fails on any host outside the font CDN.
  const requested: string[] = []
  page.on('request', (r) => requested.push(new URL(r.url()).hostname))
  await openSample(page)
  for (const tab of [/^Ingredients/, /^Recipes/, /^Menu/, /^Sales/, /^Engineering/, /^Price imports/, /^Outputs/, /^Snapshots/]) {
    await openTab(page, tab)
  }
  expect(requested.filter((h) => h.includes('supabase'))).toEqual([])
})
