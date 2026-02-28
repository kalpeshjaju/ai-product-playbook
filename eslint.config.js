/**
 * FILE PURPOSE: ESLint flat config (v9+) with TypeScript strict rules
 *
 * WHY: Playbook Tier 1 requires "ESLint with strict rules, max-warnings 0"
 * HOW: TypeScript-ESLint recommended rules + no-any + no-unused-vars
 *      Covers all packages/ and apps/ in the monorepo.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/src/**/*.{ts,tsx}', 'apps/**/src/**/*.{ts,tsx}'],
    rules: {
      // Playbook: no `any` types — use `unknown`
      '@typescript-eslint/no-explicit-any': 'error',

      // Playbook: no unused imports/vars
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // No console.log in production code
      'no-console': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
  },
);
