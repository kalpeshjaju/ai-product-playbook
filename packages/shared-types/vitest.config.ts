/**
 * Workspace-level Vitest config for @playbook/shared-types
 *
 * WHY: Pure types package — no runtime logic to test.
 *      passWithNoTests allows turbo test pipeline to pass.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
