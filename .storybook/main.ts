import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
/**
 * FILE PURPOSE: Storybook configuration for the monorepo
 *
 * WHY: OUTPUT pillar — visual component testing across admin + web apps.
 * HOW: Uses @storybook/nextjs-vite framework for Next.js compatibility.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  stories: [
    '../packages/shared-ui/src/**/*.stories.@(ts|tsx)',
    '../apps/admin/src/**/*.stories.@(ts|tsx)',
    '../apps/web/src/**/*.stories.@(ts|tsx)',
  ],
  addons: [getAbsolutePath("@storybook/addon-docs")],
  framework: {
    name: getAbsolutePath("@storybook/nextjs-vite"),
    options: {},
  },
  staticDirs: [],
};

export default config;

function getAbsolutePath(value: string): any {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
