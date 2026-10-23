import { test, expect } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createPool } = require('../../backend/db/connection')
const { testDatabaseUrl } = require('../../backend/db/isolated-schema')
let pool
const password = 'MovieNight!2026'
const changedPassword = 'MoreMovieNights!2027'
test.beforeAll(() => { pool = createPool({ databaseUrl: testDatabaseUrl(), schema: 'test_browser' }) })
test.afterAll(async () => { await pool?.end() })
test.beforeEach(async ({ page }) => {
  await pool.query('DELETE FROM auth_rate_limits')
  await page.route(/https:\/\/(www\.youtube\.com|image\.tmdb\.org|fonts\.)/, route => route.abort())
})
async function findMail(email, subject) {
  let result
  await expect.poll(async () => {
    const files = await readdir(process.env.CINEMAX_TEST_MAIL_DIR).catch(() => [])
    for (const file of files) {
      const message = await readFile(join(process.env.CINEMAX_TEST_MAIL_DIR, file), 'utf8').then(JSON.parse).catch(() => null)
      if (message?.to === email && message.subject === subject) result = message
    }
    return Boolean(result)
  }, { timeout: 30000 }).toBeTruthy()
  return result
}
async function verifyFromEmail(page, email) {
  const mail = await findMail(email, 'Verify your CineMax email')
  const link = mail.text.match(/http[^\s]+#token=[a-f0-9]+/)[0]
  await page.goto(link)
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('email is verified')
}
async function login(page, email, secret = password) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(secret)
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible()
}

test('customer can register, verify, save profile/cards/favorites, change password and log out', async ({ page }) => {
  const email = `browser-${Date.now()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('First name').fill('Cinema')
  await page.getByLabel('Last name').fill('Fan')
  await page.getByLabel('Phone number').fill('7065550100')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('account is created')
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('main').getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Account is not verified')
  await verifyFromEmail(page, email)
  await login(page, email)
  await page.getByRole('button', { name: 'Add Dune: Part Two to favorites', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Dune: Part Two from favorites' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'My profile', exact: true }).click()
  await expect(page.getByLabel('Email address')).toHaveAttribute('readonly', '')
  await expect(page.locator('#favorites')).toContainText('Dune: Part Two')
  await page.getByLabel('First name').fill('Updated')
  await page.getByLabel('Street address', { exact: true }).fill('10 Main Street')
  await page.getByLabel('City', { exact: true }).fill('Athens')
  await page.getByLabel('State', { exact: true }).fill('GA')
  await page.getByLabel('ZIP code', { exact: true }).fill('30602')
  await page.getByLabel('Send me movie news and promotions').check()
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Profile saved')
  await findMail(email, 'Your CineMax account was updated')
  await page.reload()
  await expect(page.getByLabel('First name')).toHaveValue('Updated')
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('10 Main Street')
  await expect(page.getByLabel('Send me movie news and promotions')).toBeChecked()
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Add payment card', exact: true }).click()
    await page.getByLabel('Card number', { exact: true }).fill('4242424242424242')
    await page.getByLabel('Cardholder name').fill('Cinema Fan')
    await page.getByLabel('Expiration month').fill('2035-12')
    await page.getByRole('button', { name: 'Save card', exact: true }).click()
    await expect(page.locator('.saved-card')).toHaveCount(i + 1)
  }
  await expect(page.getByRole('button', { name: 'Add payment card', exact: true })).toBeDisabled()
  await expect(page.locator('.saved-card').first()).toContainText('4242')
  await page.locator('.saved-card').first().getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Card number', { exact: true }).fill('4242424242424242')
  await page.getByLabel('Cardholder name').fill('Updated Fan')
  await page.getByRole('button', { name: 'Save card', exact: true }).click()
  await expect(page.locator('.saved-card').first()).toContainText('Updated Fan')
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.saved-card').first().getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.locator('.saved-card')).toHaveCount(2)
  await page.locator('#favorites').getByRole('button', { name: 'Remove Dune: Part Two from favorites' }).click()
  await expect(page.locator('#favorites')).toContainText('waiting for their first movie')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(tmpdir(), 'cinemax-sprint2-profile.png'), fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible()
  await page.screenshot({ path: join(tmpdir(), 'cinemax-sprint2-profile-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByLabel('Current password').fill('WrongPassword!2026')
  await page.getByLabel('New password', { exact: true }).fill(changedPassword)
  await page.getByLabel('Confirm password').fill(changedPassword)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('current password is incorrect')
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toContainText('Password changed')
  await login(page, email, changedPassword)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('logged out')
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
})

test('reset email completes recovery and admins land on the protected prototype', async ({ page, request }) => {
  const email = `admin-${Date.now()}@example.com`
  const response = await request.post('/api/auth/register', {
    headers: { 'X-CineMax-Request': '1' },
    data: { first_name: 'Admin', last_name: 'User', email, phone_number: '7065550100', password, confirm_password: password, subscribed_to_promotions: false },
  })
  expect(response.status()).toBe(201)
  await verifyFromEmail(page, email)
  await pool.query("UPDATE users SET role='admin' WHERE email=$1", [email])
  await page.goto('/forgot-password')
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('eligible account')
  const mail = await findMail(email, 'Reset your CineMax password')
  const link = mail.text.match(/http[^\s]+#token=[a-f0-9]+/)[0]
  await page.goto(link)
  await page.getByLabel('Password', { exact: true }).fill(changedPassword)
  await page.getByLabel('Confirm password').fill(changedPassword)
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Password reset successfully')
  await login(page, email, changedPassword)
  await expect(page).toHaveURL(/\/admin$/)
  for (const name of ['Manage Movies', 'Promotions', 'Users', 'Showtimes']) {
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await expect(page.getByText(`${name} is a prototype workspace`, { exact: false })).toBeVisible()
  }
  await page.screenshot({ path: join(tmpdir(), 'cinemax-sprint2-admin.png'), fullPage: true })
})

test('mobile forms fit the viewport, show validation and protect anonymous routes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/register')
  await page.getByLabel('Email address').fill('mobile@example.com')
  await page.getByLabel('First name').fill('Mobile')
  await page.getByLabel('Last name').fill('Viewer')
  await page.getByLabel('Phone number').fill('123')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('phone number')
  await expect(page.getByRole('alert')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: join(tmpdir(), 'cinemax-sprint2-mobile.png'), fullPage: true })
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/verify-email')
  await expect(page.getByRole('alert')).toContainText('incomplete')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/register')
  await page.screenshot({ path: join(tmpdir(), 'cinemax-sprint2-register.png'), fullPage: true })
})

test('favorites wait for saved state, work by keyboard on detail pages and recover from load failures', async ({ page, request }) => {
  const email = `favorites-ui-${Date.now()}@example.com`
  expect((await request.post('/api/auth/register', {
    headers: { 'X-CineMax-Request': '1' },
    data: { first_name: 'Favorite', last_name: 'Viewer', email, phone_number: '7065550100', password, confirm_password: password, subscribed_to_promotions: false },
  })).status()).toBe(201)
  await verifyFromEmail(page, email)
  let release
  const pending = new Promise(resolve => { release = resolve })
  await page.route('**/api/account/favorites', async route => {
    const response = await route.fetch()
    await pending
    await route.fulfill({ response })
  })
  await login(page, email)
  const heart = page.getByRole('button', { name: 'Add Dune: Part Two to favorites', exact: true })
  try { await expect(heart).toBeDisabled() } finally { release() }
  await expect(heart).toBeEnabled()
  await page.unroute('**/api/account/favorites')
  await page.goto('/movie/1')
  const detailHeart = page.getByRole('button', { name: 'Add Dune: Part Two to favorites', exact: true })
  await expect(detailHeart).toBeEnabled()
  await detailHeart.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Remove Dune: Part Two from favorites' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove Dune: Part Two from favorites' })).toBeEnabled()
  await page.route('**/api/account/favorites', route => route.fulfill({ status: 503, json: { error: 'Favorites temporarily unavailable.' } }))
  await page.route('**/api/account/cards', route => route.fulfill({ status: 503, json: { error: 'Cards temporarily unavailable.' } }))
  await page.goto('/profile')
  await expect(page.locator('#favorites').getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.locator('#favorites')).not.toContainText('waiting for their first movie')
  await expect(page.locator('#payment-cards').getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.locator('#payment-cards')).not.toContainText('No payment cards saved yet')
  await page.unroute('**/api/account/favorites')
  await page.unroute('**/api/account/cards')
  await page.getByRole('button', { name: 'Retry favorites', exact: true }).click()
  await expect(page.locator('#favorites')).toContainText('Dune: Part Two')
  await page.getByRole('button', { name: 'Retry loading cards', exact: true }).click()
  await expect(page.locator('#payment-cards')).toContainText('No payment cards saved yet')
  await page.goto('/admin')
  await expect(page).toHaveURL('/')
})
