import { test, expect } from '@playwright/test'
const show = { id: 42, movie_id: 1, date: '2030-05-01', time: '17:00:00', title: 'Dune: Part Two', showroom: 'Showroom 1', poster: '/poster-placeholder.svg' }
const types = [{ id: 1, name: 'Adult', price: '12.99', age_criteria: 'Ages 12–64' }, { id: 2, name: 'Child', price: '8.99', age_criteria: 'Under 12' }]
const seats = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, row_label: String.fromCharCode(65 + Math.floor(i / 10)), seat_number: i % 10 + 1, booked: i === 0 }))
const user = { id: 1, first_name: 'Test', role: 'customer', email: 'viewer@example.com' }
test('guest selection survives login, summary confirms email and payment stays a mockup', async ({ page }) => {
  let loggedIn = false
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/account') return route.fulfill({ status: loggedIn ? 200 : 401, json: loggedIn ? { user } : { error: 'Log in' } })
    if (path === '/api/account/favorites') return route.fulfill({ json: [] })
    if (path === '/api/auth/login') { loggedIn = true; return route.fulfill({ json: { user } }) }
    if (path === '/api/shows/42/seats') return route.fulfill({ json: { show, seats, ticket_types: types } })
    if (path.startsWith('/api/checkout/')) {
      const body = route.request().postDataJSON()
      expect(body.tickets).toEqual([{ seat_id: 2, ticket_type_id: 1 }])
      return route.fulfill({ json: { show, tickets: [{ seat_id: 2, seat: 'A2', type: 'Adult', price: '12.99' }], subtotal: '12.99', email: body.email || user.email, mock: true } })
    }
    return route.fulfill({ status: 404, json: { error: path } })
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/booking/1/42')
  await expect(page.getByLabel('Seat A1 unavailable')).toBeDisabled()
  await page.getByLabel('Select seat A2', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Proceed to Checkout' })).toBeDisabled()
  await page.getByLabel('Increase Adult tickets').click()
  await page.reload()
  await expect(page.getByLabel('Select seat A2', { exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: '/tmp/cinemax-sprint3-seats.png', fullPage: true })
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('MovieNight!2026')
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order summary' })).toBeVisible()
  await expect(page.getByLabel('Confirmation email')).toHaveValue(user.email)
  await expect(page.getByRole('cell', { name: 'A2', exact: true })).toBeVisible()
  await page.getByLabel('Confirmation email').fill('other@example.com')
  await page.getByRole('button', { name: 'Confirm and continue to payment' }).click()
  await expect(page.getByRole('heading', { name: 'Payment mockup' })).toBeVisible()
  await expect(page.getByText('other@example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pay now/ })).toBeDisabled()
  await page.reload()
  await expect(page.getByText('other@example.com', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/cinemax-sprint3-payment.png', fullPage: true })
  expect(errors).toEqual([])
})
test('admin adds a movie and schedules it using available showrooms', async ({ page }) => {
  let created = false, scheduled = false
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/account') return route.fulfill({ json: { user: { ...user, role: 'admin' } } })
    if (path === '/api/admin/catalog') return route.fulfill({ json: { movies: [{ id: 1, title: 'New movie' }], genres: [{ id: 1, name: 'Drama' }], showrooms: [{ id: 1, name: 'Showroom 1' }] } })
    if (path === '/api/admin/movies') { created = true; expect(route.request().postDataJSON().genre_ids).toEqual([1]); return route.fulfill({ status: 201, json: { id: 1, title: 'New movie' } }) }
    if (path === '/api/admin/available-showrooms') return route.fulfill({ json: [{ id: 1, name: 'Showroom 1', seat_capacity: 70 }] })
    if (path === '/api/admin/shows') { scheduled = true; expect(route.request().postDataJSON().showroom_id).toBe(1); return route.fulfill({ status: 201, json: { id: 42 } }) }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/admin')
  for (const label of ['Title', 'Cast', 'Director', 'Producer']) await page.getByLabel(label, { exact: true }).fill('New movie')
  await page.getByLabel('Poster URL').fill('https://example.com/poster.jpg')
  await page.getByLabel('Trailer URL').fill('https://www.youtube.com/embed/abc123')
  await page.getByLabel('Synopsis').fill('A movie synopsis.')
  await page.getByLabel('Drama', { exact: true }).check()
  await page.getByRole('button', { name: 'Add movie', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('was added')
  expect(created).toBeTruthy()
  await page.getByRole('button', { name: 'Schedule this movie' }).click()
  await page.getByLabel('Show date').fill('2030-05-01')
  await page.getByLabel('Show time').fill('17:00')
  await page.getByRole('button', { name: 'Find available showrooms' }).click()
  await page.getByLabel('Available showroom').selectOption('1')
  await page.getByRole('button', { name: 'Confirm showtime' }).click()
  await expect(page.getByRole('status')).toContainText('Showtime scheduled')
  expect(scheduled).toBeTruthy()
  await page.screenshot({ path: '/tmp/cinemax-sprint3-admin.png', fullPage: true })
})
