/**
 * FILE PURPOSE: Vitest config for API contract tests
 *
 * WHY: Separate from unit test config — these tests hit a real API server
 *      backed by Postgres+pgvector and Redis. No mocks.
 *
 * HOW: Self-orchestrating — globalSetup starts the API server if not already
 *      running. Works in CI (GitHub Actions services) and locally (auto-start).
 *      Locally: requires `npx turbo run build --filter=@playbook/api...` first.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e-infra/**/*.test.ts'],
    globalSetup: ['tests/e2e-infra/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    setupTimeout: 60_000,
    passWithNoTests: false,
    sequence: {
      concurrent: false,
    },
  },
});
