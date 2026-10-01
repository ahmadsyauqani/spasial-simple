import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    viewport: { width: 1440, height: 900 },
    channel: 'chrome',
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx next dev --webpack --port 3100',
    url: process.env.E2E_BASE_URL || 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
