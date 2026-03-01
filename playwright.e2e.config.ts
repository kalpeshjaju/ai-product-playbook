/**
 * FILE PURPOSE: Playwright config for full-stack E2E tests (browser → API → DB)
 *
 * WHY: Separate from playwright.config.ts (smoke tests against dev server only).
 *      These tests require the full Docker stack (Postgres, Redis, API server)
 *      plus both web and admin apps.
 *
 * HOW: `npx playwright test --config=playwright.e2e.config.ts`
 *      Requires: API + infra reachable on port 3002.
 *      Web/admin dev servers are auto-started by this Playwright config.
 *      Run via: scripts/test-e2e-infra.sh (Layer 3)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-infra',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e-infra/playwright-global-setup.ts',
  timeout: 45_000,
  retries: 1,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Web Full-Stack',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3200',
      },
      testMatch: 'web-full-stack.spec.ts',
    },
    {
      name: 'Admin Full-Stack',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3201',
      },
      testMatch: 'admin-full-stack.spec.ts',
    },
  ],
  webServer: [
    {
      command: 'API_INTERNAL_KEY=${API_INTERNAL_KEY:-test-internal-key-for-ci} NEXT_PUBLIC_API_URL=${E2E_API_URL:-http://localhost:3002} npm run dev --workspace=apps/web -- --port 3200',
      port: 3200,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'API_INTERNAL_KEY=${API_INTERNAL_KEY:-test-internal-key-for-ci} NEXT_PUBLIC_API_URL=${E2E_API_URL:-http://localhost:3002} NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= npm run dev --workspace=apps/admin -- --port 3201',
      port: 3201,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
