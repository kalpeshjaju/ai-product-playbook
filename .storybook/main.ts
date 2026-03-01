/**
 * FILE PURPOSE: Storybook configuration for the monorepo
 *
 * WHY: OUTPUT pillar — visual component testing across admin + web apps.
 * HOW: Uses @storybook/nextjs framework for Next.js compatibility.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  stories: [
    '../packages/shared-ui/src/**/*.stories.@(ts|tsx)',
    '../apps/admin/src/**/*.stories.@(ts|tsx)',
    '../apps/web/src/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  staticDirs: [],
};

export default config;
