/**
 * FILE PURPOSE: Unit tests for DataCard component
 *
 * WHY: Shared component used across web + admin — must not regress.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataCard } from '../src/data-card';

describe('DataCard', () => {
  it('renders title and string value', () => {
    render(<DataCard title="Total Cost" value="$142.50" />);
    expect(screen.getByText('Total Cost')).toBeDefined();
    expect(screen.getByText('$142.50')).toBeDefined();
  });

  it('renders numeric value as string', () => {
    render(<DataCard title="API Calls" value={1284} />);
    expect(screen.getByText('1284')).toBeDefined();
  });

  it('renders subtitle when provided', () => {
    render(<DataCard title="Calls" value={100} subtitle="Last 30 days" />);
    expect(screen.getByText('Last 30 days')).toBeDefined();
  });

  it('does not render subtitle when omitted', () => {
    const { container } = render(<DataCard title="Calls" value={100} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(2); // title + value only
  });
});
