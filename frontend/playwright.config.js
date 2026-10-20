import { defineConfig } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.CINEMAX_TEST_MAIL_DIR ||= join(tmpdir(), `cinemax-browser-mail-${process.pid}`)

export default defineConfig({
  testDir: './test',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:5017',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Resets the test_browser schema to fresh sample data, so demo data in `public` is untouched.
    command: 'node test-server.mjs',
    url: 'http://127.0.0.1:5017/api/movies',
    env: {
      PORT: '5017', NODE_ENV: 'test', APP_URL: 'http://127.0.0.1:5017',
      DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      MAIL_MODE: 'file', MAIL_OUTPUT_DIR: process.env.CINEMAX_TEST_MAIL_DIR,
    },
    reuseExistingServer: false,
    timeout: 120000,
  },
})
