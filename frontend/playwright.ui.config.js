import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './test-ui', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5018', channel: 'chrome' },
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 5018', url: 'http://127.0.0.1:5018', reuseExistingServer: false },
})
