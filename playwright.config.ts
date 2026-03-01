/**
 * FILE PURPOSE: Playwright E2E test configuration
 *
 * WHY: Smoke tests for web and admin apps to catch deploy regressions.
 *      Tests run against local dev server.
 *
 * HOW: `npx playwright test` from repo root.
 *      Requires: `npx playwright install chromium` first.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace=apps/web -- --port 3100',
      port: 3100,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= npm run dev --workspace=apps/admin -- --port 3101',
      port: 3101,
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
