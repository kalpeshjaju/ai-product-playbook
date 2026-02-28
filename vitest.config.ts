/**
 * FILE PURPOSE: Root Vitest config for monorepo
 *
 * WHY: Playbook Tier 1 requires unit tests in CI.
 *      Root config provides shared defaults; packages can override.
 * HOW: Vitest workspace mode — discovers tests in packages/ and apps/
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'apps/**/tests/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts', 'apps/**/src/**/*.ts'],
      exclude: ['**/index.ts'],
    },
  },
});
