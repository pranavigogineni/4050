import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createPool } = require('../../backend/db/connection')
const { testDatabaseUrl } = require('../../backend/db/isolated-schema')
const { hashPassword } = require('../../backend/accounts/security')
const password = 'SprintThree!2026'
let pool
const adminEmail = 'sprint3-admin@example.com'
const customerEmail = 'sprint3-customer@example.com'

test.beforeAll(async () => {
  pool = createPool({ databaseUrl: testDatabaseUrl(), schema: 'test_browser' })
  const hash = await hashPassword(password)
  for (const [role, email] of [['admin', adminEmail], ['customer', customerEmail]]) {
    await pool.query(`INSERT INTO users (role,first_name,last_name,email,password_hash,phone_number,status)
      VALUES ($1,'Sprint','Three',$2,$3,'7065550100','ACTIVE')`, [role, email, hash])
  }
})
test.afterAll(async () => { await pool?.end() })

async function login(page, email) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible()
}

test('real database: admin creates and schedules a movie; guest logs in and completes checkout to mock payment', async ({ page }) => {
  await pool.query('DELETE FROM auth_rate_limits')
  await page.route(/https:\/\/(www\.youtube\.com|image\.tmdb\.org|fonts\.|example\.com)/, route => route.abort())
  await page.goto('/login')
  await login(page, adminEmail)
  await expect(page).toHaveURL(/\/admin$/)
  for (const [label, value] of [['Title', 'Sprint 3 Integration Movie'], ['Cast', 'Actor One, Actor Two'], ['Director', 'Test Director'], ['Producer', 'Test Producer']]) {
    await page.getByLabel(label, { exact: true }).fill(value)
  }
  await page.getByLabel('Poster URL').fill('https://example.com/poster.jpg')
  await page.getByLabel('Trailer URL').fill('https://www.youtube.com/embed/abc123')
  await page.getByLabel('Synopsis').fill('A screening for the complete Sprint 3 flow.')
  await page.getByLabel('Drama', { exact: true }).check()
  await page.getByRole('button', { name: 'Add movie', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('was added to the catalog')
  const { rows: [movie] } = await pool.query("SELECT id FROM movies WHERE title='Sprint 3 Integration Movie'")
  expect(movie).toBeTruthy()
  await page.getByRole('button', { name: 'Schedule this movie' }).click()
  const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  await page.getByLabel('Show date').fill(date)
  await page.getByLabel('Show time').fill('17:00')
  await page.getByRole('button', { name: 'Find available showrooms' }).click()
  const { rows: [room] } = await pool.query('SELECT id FROM showrooms ORDER BY id LIMIT 1')
  await page.getByLabel('Available showroom').selectOption(String(room.id))
  await page.getByRole('button', { name: 'Confirm showtime' }).click()
  await expect(page.getByRole('status')).toContainText('Showtime scheduled')
  // Once scheduled, the room must disappear from the overlapping interval choices.
  await page.getByRole('button', { name: 'Find available showrooms' }).click()
  await expect(page.getByLabel('Available showroom').locator(`option[value="${room.id}"]`)).toHaveCount(0)
  const { rows: [show] } = await pool.query('SELECT id, starts_at FROM shows WHERE movie_id=$1', [movie.id])
  const { rows: [customer] } = await pool.query('SELECT id FROM users WHERE email=$1', [customerEmail])
  const { rows: [seat] } = await pool.query('SELECT id FROM seats WHERE showroom_id=$1 ORDER BY id LIMIT 1', [room.id])
  const { rows: [type] } = await pool.query("SELECT id FROM ticket_types WHERE name='Adult'")
  const { rows: [booking] } = await pool.query(`INSERT INTO bookings
    (customer_id,show_id,movie_title_snapshot,show_date_time_snapshot,subtotal,sales_tax,booking_fee,total_price,status)
    VALUES ($1,$2,'Sprint 3 Integration Movie',$3,12.99,0,0,12.99,'CONFIRMED') RETURNING id`, [customer.id, show.id, show.starts_at])
  await pool.query(`INSERT INTO tickets (booking_id,show_id,showroom_id,seat_id,ticket_type_id,seat_label_snapshot,ticket_type_snapshot,price_paid)
    VALUES ($1,$2,$3,$4,$5,'A1','Adult',12.99)`, [booking.id, show.id, room.id, seat.id, type.id])
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await page.goto(`/movie/${movie.id}`)
  await page.getByRole('button', { name: /Book .*5:00 PM/ }).click()
  await expect(page.getByLabel('Seat A1 unavailable')).toBeDisabled()
  await page.getByLabel('Increase Adult tickets').click()
  await page.getByLabel('Increase Child tickets').click()
  await page.getByLabel('Select seat A2', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Proceed to Checkout' })).toBeDisabled()
  await page.getByLabel('Select seat A3', { exact: true }).click()
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, customerEmail)
  await expect(page).toHaveURL(new RegExp(`/checkout/${show.id}$`))
  await expect(page.getByRole('heading', { name: 'Order summary' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'A2', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'A3', exact: true })).toBeVisible()
  await expect(page.locator('.order-total')).toContainText('$21.98')
  await expect(page.getByLabel('Confirmation email')).toHaveValue(customerEmail)
  await page.getByLabel('Confirmation email').fill('order-only@example.com')
  await page.getByRole('button', { name: 'Confirm and continue to payment' }).click()
  await expect(page.getByRole('heading', { name: 'Payment mockup' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('order-only@example.com', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pay now/ })).toBeDisabled()
  expect((await pool.query('SELECT email FROM users WHERE id=$1', [customer.id])).rows[0].email).toBe(customerEmail)
  expect((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE show_id=$1', [show.id])).rows[0].n).toBe(1)
})

test('promotion bonus saves a code and delivers email only to subscribed customers', async ({ page }) => {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  await pool.query('DELETE FROM auth_rate_limits')
  await pool.query('UPDATE users SET subscribed_to_promotions=false')
  await pool.query('UPDATE users SET subscribed_to_promotions=true WHERE email=$1', [customerEmail])
  await page.goto('/login')
  await login(page, adminEmail)
  await page.getByRole('button', { name: /Manage Promotions/ }).click()
  await page.getByLabel('Promotion code').fill('movienight25')
  await page.getByLabel('Discount percent').fill('25')
  const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  await page.getByLabel('Promotion start date').fill(start)
  await page.getByLabel('Promotion end date').fill(end)
  await page.getByLabel('Promotion description').fill('Save on your next movie night.')
  await page.getByRole('button', { name: 'Create promotion and email subscribers' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Promotion MOVIENIGHT25 created.' })).toContainText('1 subscriber email(s) queued')
  await expect(page.getByRole('cell', { name: 'MOVIENIGHT25', exact: true })).toBeVisible()
  await expect.poll(async () => {
    const messages = await Promise.all((await readdir(process.env.CINEMAX_TEST_MAIL_DIR).catch(() => [])).map(async file => {
      try { return JSON.parse(await readFile(join(process.env.CINEMAX_TEST_MAIL_DIR, file), 'utf8')) } catch { return null }
    }))
    return messages.filter(m => m?.subject === 'CineMax promotion: MOVIENIGHT25').map(m => m.to)
  }, { timeout: 15000 }).toEqual([customerEmail])
  await page.reload()
  await page.getByRole('button', { name: /Manage Promotions/ }).click()
  await expect(page.getByRole('cell', { name: 'MOVIENIGHT25', exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/cinemax-promotion-bonus.png', fullPage: true })
})
