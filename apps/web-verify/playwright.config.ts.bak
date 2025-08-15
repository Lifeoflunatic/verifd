import { defineConfig } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },
  // Important: CI workflow already starts servers & waits for readiness.
  // Avoid port clash by disabling Playwright-managed server on CI.
  webServer: CI
    ? undefined
    : {
        command: 'pnpm -w --filter @verifd/web-verify dev --port 3000',
        port: 3000,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { 
        ...require('@playwright/test').devices['Desktop Chrome'],
        permissions: ['microphone'],
      },
    },
    {
      name: 'firefox',
      use: { ...require('@playwright/test').devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...require('@playwright/test').devices['Desktop Safari'] },
    },
  ],
  outputDir: 'test-results/',
  reporter: CI ? [['html'], ['list']] : [['html'], ['list', { printSteps: true }]],
});