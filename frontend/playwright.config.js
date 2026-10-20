import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5017',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Resets the test_browser schema to fresh sample data, so demo data in `public` is untouched.
    command: 'npm run build && node ../backend/db/isolated-schema.js serve test_browser',
    url: 'http://127.0.0.1:5017/api/movies',
    env: { PORT: '5017' },
    reuseExistingServer: false,
    timeout: 120000,
  },
})
