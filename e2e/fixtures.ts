import { expect, test as base, type Page } from '@playwright/test'

/**
 * Every test runs signed out in a fresh browser context (fresh IndexedDB), with all
 * non-local network traffic blocked. A test fails if the page throws an uncaught
 * error, or if the app tries to reach anything other than the web-font CDN.
 */
const ALLOWED_EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin
      const pageErrors: string[] = []
      const external: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await page.context().route(
        (url) => url.origin !== origin,
        (route) => {
          external.push(new URL(route.request().url()).hostname)
          return route.abort()
        },
      )
      await use()
      expect(pageErrors, 'uncaught page errors').toEqual([])
      expect(
        external.filter((h) => !ALLOWED_EXTERNAL_HOSTS.includes(h)),
        'requests to hosts other than the font CDN (all external traffic is blocked)',
      ).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Load the synthetic sample bistro from the workspace and return the project's base path. */
export async function openSample(page: Page): Promise<string> {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Try the sample bistro' }).click()
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Bistro Mirabel (sample)' })).toBeVisible()
  return new URL(page.url()).pathname
}

/** Open a project section from the side navigation. */
export async function openTab(page: Page, label: string | RegExp) {
  await page.getByRole('complementary', { name: 'Project sections' }).getByRole('link', { name: label }).click()
}

/** Read the project record back out of IndexedDB, to prove what was actually persisted. */
export function storedProject(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ name: string; data: { ingredients: { id: string; price: number }[]; sales: { label: string }[] } } | null>((resolve, reject) => {
        const open = indexedDB.open('menu-margin', 1)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction('projects').objectStore('projects').getAll()
          all.onsuccess = () => resolve(all.result[0] ?? null)
          all.onerror = () => reject(all.error)
        }
      }),
  )
}

/** A file for `setInputFiles`. */
export const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') })
