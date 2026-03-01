/**
 * FILE PURPOSE: Storybook stories for PromptManager component
 *
 * WHY: OUTPUT pillar — visual regression testing for prompt management UI.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PromptManager } from './prompt-manager';

const meta: Meta<typeof PromptManager> = {
  title: 'Admin/PromptManager',
  component: PromptManager,
  args: {
    apiUrl: 'http://localhost:3002',
  },
};

export default meta;
type Story = StoryObj<typeof PromptManager>;

export const Default: Story = {};
