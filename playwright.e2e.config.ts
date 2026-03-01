/**
 * FILE PURPOSE: Playwright config for full-stack E2E tests (browser → API → DB)
 *
 * WHY: Separate from playwright.config.ts (smoke tests against dev server only).
 *      These tests require Postgres + Redis + API server + web/admin servers.
 *
 * HOW: `npx playwright test --config=playwright.e2e.config.ts`
 *      webServer blocks auto-start web + admin in dev mode (API must be running).
 *      In CI, servers are started externally — set E2E_SKIP_SERVER=1 to skip.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-02
 */

import { defineConfig, devices } from '@playwright/test';

const skipServer = process.env.E2E_SKIP_SERVER === '1' || process.env.CI === 'true';

export default defineConfig({
  testDir: './tests/e2e-infra',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  retries: 1,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: skipServer ? [] : [
    {
      command: 'npx next dev apps/web --port 3000',
      port: 3000,
      timeout: 60_000,
      reuseExistingServer: true,
      env: { NEXT_PUBLIC_API_URL: 'http://localhost:3002' },
    },
    {
      command: 'npx next dev apps/admin --port 3001',
      port: 3001,
      timeout: 60_000,
      reuseExistingServer: true,
      env: { NEXT_PUBLIC_API_URL: 'http://localhost:3002' },
    },
  ],
  projects: [
    {
      name: 'Web Full-Stack',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
      },
      testMatch: 'web-full-stack.spec.ts',
    },
    {
      name: 'Admin Full-Stack',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
      },
      testMatch: 'admin-full-stack.spec.ts',
    },
  ],
});
