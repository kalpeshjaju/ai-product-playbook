/**
 * FILE PURPOSE: Storybook stories for CostReset component
 *
 * WHY: OUTPUT pillar — visual regression testing for cost reset button.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CostReset } from './cost-reset';

const meta: Meta<typeof CostReset> = {
  title: 'Admin/CostReset',
  component: CostReset,
};

export default meta;
type Story = StoryObj<typeof CostReset>;

export const Default: Story = {};
