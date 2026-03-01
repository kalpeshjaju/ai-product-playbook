/**
 * FILE PURPOSE: Vitest config for API contract tests
 *
 * WHY: Separate from unit test config — these tests hit a real API server
 *      backed by Postgres+pgvector and Redis. No mocks.
 *
 * HOW: In CI — `npm run test:contract` (services provided by GitHub Actions).
 *      Locally — E2E_API_URL=http://localhost:3002 npm run test:contract
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e-infra/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    passWithNoTests: false,
    sequence: {
      concurrent: false,
    },
  },
});
