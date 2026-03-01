/**
 * FILE PURPOSE: Storybook stories for the DataCard shared component
 *
 * WHY: OUTPUT pillar — visual regression testing for the reusable data card
 *      used in both admin and web apps for displaying stats and metrics.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { Meta, StoryObj } from '@storybook/react';
import { DataCard } from './data-card';

const meta: Meta<typeof DataCard> = {
  title: 'Shared/DataCard',
  component: DataCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DataCard>;

export const Default: Story = {
  args: {
    title: 'Total Cost',
    value: '$142.50',
  },
};

export const WithSubtitle: Story = {
  args: {
    title: 'API Calls',
    value: 1284,
    subtitle: 'Last 30 days',
  },
};

export const NumericValue: Story = {
  args: {
    title: 'Error Rate',
    value: 0.03,
    subtitle: '3% of total calls',
  },
};
