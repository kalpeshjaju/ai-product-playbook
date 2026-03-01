/**
 * FILE PURPOSE: Playwright config for full-stack E2E tests (browser → API → DB)
 *
 * WHY: Separate from playwright.config.ts (smoke tests against dev server only).
 *      These tests require the full Docker stack (Postgres, Redis, API server)
 *      plus both web and admin dev servers running.
 *
 * HOW: `npx playwright test --config=playwright.e2e.config.ts`
 *      Requires: Docker stack up + dev servers on ports 3000/3001/3002.
 *      Run via: scripts/test-e2e-infra.sh (Layer 3)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-infra',
  testMatch: '**/*.spec.ts',
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
