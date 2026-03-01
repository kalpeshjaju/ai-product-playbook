/**
 * FILE PURPOSE: Storybook stories for the Memory Browser admin page
 *
 * WHY: OUTPUT pillar — visual regression testing for the memory browser,
 *      which allows admins to inspect and manage user memory entries.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import MemoryPage from './page';

const meta: Meta<typeof MemoryPage> = {
  title: 'Admin/MemoryBrowser',
  component: MemoryPage,
  parameters: { nextjs: { appDirectory: true } },
};

export default meta;
type Story = StoryObj<typeof MemoryPage>;

export const Default: Story = {};
