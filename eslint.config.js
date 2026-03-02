// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

/**
 * FILE PURPOSE: ESLint flat config (v9+) with TypeScript strict rules
 *
 * WHY: Playbook Tier 1 requires "ESLint with strict rules, max-warnings 0"
 * HOW: TypeScript-ESLint recommended rules + no-any + no-unused-vars
 *      Covers all packages/ and apps/ in the monorepo.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import vitest from '@vitest/eslint-plugin';

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
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
}, {
  files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
  plugins: {
    '@next/next': nextPlugin,
  },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
  },
}, {
  files: ['**/tests/**/*.test.{ts,tsx}'],
  plugins: { vitest },
  rules: {
    'vitest/expect-expect': 'error',
  },
}, {
  ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
}, storybook.configs["flat/recommended"]);
