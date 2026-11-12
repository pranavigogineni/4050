import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Functional tests are independent of external media availability.
  await page.route(/https:\/\/(www\.youtube\.com|image\.tmdb\.org|fonts\.)/, route => route.abort())
})

test('catalog, combined filters, details and session booking', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.mcard')).toHaveCount(10)
  // 6 now-playing movies × 3 daily showtimes; coming-soon movies have no shows yet.
  await expect(page.locator('.mcard-showtime')).toHaveCount(18)
  await expect(page.getByLabel('Filter by show date (not available)')).toBeDisabled()
  await page.getByLabel('Search by title').fill('uNe')
  await expect(page.locator('.mcard')).toHaveCount(1)
  await expect(page.locator('.mcard-title')).toHaveText('Dune: Part Two')
  await page.getByLabel('Filter by genre').selectOption('Action')
  await expect(page.getByText('No results found for')).toBeVisible()
  await page.getByLabel('Clear search').click()
  await expect(page.locator('.mcard')).toHaveCount(4)
  await page.getByLabel('Filter by genre').selectOption('')
  await expect(page.locator('.mcard')).toHaveCount(10)
  await page.locator('.mcard').first().click()
  await expect.poll(() => page.locator('.st-btn').count()).toBeGreaterThanOrEqual(18)
  await expect(page.locator('iframe')).toHaveAttribute('src', /youtube.com\/embed/)
  await page.getByRole('button', { name: /Book .*5:00 PM/ }).first().click()
  await expect(page.locator('.booking-meta')).toContainText('17:00')
  await expect(page.locator('.seat')).toHaveCount(70)
  const seat = page.locator('.seat:not(:disabled)').first()
  await seat.click()
  await expect(seat).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Proceed to Checkout' })).toBeDisabled()
  await page.getByLabel('Increase Adult tickets').click()
  await expect(page.locator('.ot-amt')).toHaveText('$12.99')
  await expect(page.getByRole('button', { name: 'Proceed to Checkout' })).toBeEnabled()
  await seat.click()
  await expect(page.getByRole('button', { name: 'Proceed to Checkout' })).toBeDisabled()
  await page.getByLabel('Increase Child tickets').click()
  await page.getByLabel('Increase Senior tickets').click()
  await expect(page.locator('.ot-amt')).toHaveText('$31.97')
})

test('a delayed old search cannot overwrite the latest results', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.mcard')).toHaveCount(10)
  let oldResponseSent
  const oldResponse = new Promise(resolve => { oldResponseSent = resolve })
  await page.route('**/api/movies?*', async route => {
    const response = await route.fetch()
    if (new URL(route.request().url()).searchParams.get('search') === 'Dune') {
      await new Promise(resolve => setTimeout(resolve, 600))
      await route.fulfill({ response }); oldResponseSent()
    } else await route.fulfill({ response })
  })
  const requested = page.waitForRequest(request => request.url().includes('search=Dune'))
  await page.getByLabel('Search by title').fill('Dune')
  await requested
  await page.getByLabel('Search by title').fill('Wicked')
  await expect(page.locator('.mcard-title')).toHaveText('Wicked')
  await oldResponse
  await expect(page.locator('.mcard-title')).toHaveText('Wicked')
})

test('API errors are distinct from empty results and can be retried', async ({ page }) => {
  await page.route('**/api/movies?*', route => route.fulfill({ status: 500, json: { error: 'failure' } }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Unable to load movies')
  await expect(page.getByText('No movies currently showing.')).toHaveCount(0)
  await page.unroute('**/api/movies?*')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.mcard')).toHaveCount(10)
  await page.route('**/api/movies?*', route => route.fulfill({ json: [] }))
  await page.reload()
  await expect(page.getByText('No movies currently showing.')).toBeVisible()
  await expect(page.getByText('Stay tuned for upcoming releases.')).toBeVisible()
})

test('malformed booking links, missing movies and unknown routes recover', async ({ page }) => {
  for (const path of ['/booking/1/%25', '/booking/1/nonsense']) {
    await page.goto(path)
    await expect(page.getByRole('alert')).toContainText('This showtime is not available')
  }
  await page.goto('/movie/99999')
  await expect(page.getByRole('alert')).toContainText('Movie not found')
  await page.goto('/not-a-page')
  await expect(page.getByRole('alert')).toContainText('Page not found')
})

test('selection survives refresh and the checkout login redirect', async ({ page }) => {
  await page.goto('/movie/1')
  await page.locator('.st-btn').first().click()
  await page.locator('.seat:not(:disabled)').first().click()
  await page.getByLabel('Increase Adult tickets').click()
  const bookingUrl = page.url()
  await page.reload()
  await expect(page.locator('.seat.sel')).toHaveCount(1)
  await expect(page.locator('.ot-amt')).toHaveText('$12.99')
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto(bookingUrl)
  await expect(page.locator('.seat.sel')).toHaveCount(1)
})

test('failed posters use local fallback and mobile seat map stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/movie/1')
  await expect(page.locator('.detail-poster')).toHaveAttribute('src', '/poster-placeholder.svg')
  await page.getByRole('button', { name: /Book .*2:00 PM/ }).first().click()
  await expect(page.locator('.seat')).toHaveCount(70)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  const map = page.locator('.seat-scroll')
  expect(await map.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy()
  expect(await page.locator('.seat').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(40)
})
