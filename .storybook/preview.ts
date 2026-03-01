/**
 * FILE PURPOSE: Storybook preview configuration
 *
 * WHY: Global decorators and parameters for all stories.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
