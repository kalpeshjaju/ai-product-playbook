/**
 * Workspace-level Vitest config for @playbook/shared-llm
 *
 * WHY: Turbo runs `vitest run` per-workspace. The root config's include
 *      patterns are relative and don't resolve when CWD is this directory.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
  },
});
