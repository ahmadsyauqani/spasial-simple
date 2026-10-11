import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'layer-workspace.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: '../artifacts/layer-workspace',
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3001',
    viewport: { width: 1440, height: 900 },
    channel: 'chrome',
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
});
