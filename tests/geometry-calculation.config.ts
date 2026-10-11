import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['geometry-calculation.spec.ts', 'geometry-calculation-ui.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 12_000 },
  workers: 1,
  retries: 0,
  outputDir: '../artifacts/geometry-calculation-tests',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3002',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
