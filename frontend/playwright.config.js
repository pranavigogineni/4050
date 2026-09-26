import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'ces-browser-'))
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
    command: 'npm run build && node ../backend/server.js',
    url: 'http://127.0.0.1:5017/api/movies',
    env: { PORT: '5017', SQLITE_DB_PATH: join(directory, 'cinema.db') },
    reuseExistingServer: false,
  },
})
