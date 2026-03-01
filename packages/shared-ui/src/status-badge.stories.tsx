/**
 * FILE PURPOSE: Storybook stories for the StatusBadge shared component
 *
 * WHY: OUTPUT pillar — visual regression testing for the reusable status badge
 *      used in both admin and web apps for displaying item statuses.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { Meta, StoryObj } from '@storybook/nextjs';
import { StatusBadge } from './status-badge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Shared/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Active: Story = {
  args: {
    status: 'active',
  },
};

export const Draft: Story = {
  args: {
    status: 'draft',
  },
};

export const Deprecated: Story = {
  args: {
    status: 'deprecated',
  },
};

export const CustomLabel: Story = {
  args: {
    status: 'active',
    label: 'Live',
  },
};
