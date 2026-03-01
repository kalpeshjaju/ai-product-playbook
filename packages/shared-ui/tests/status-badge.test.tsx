/**
 * FILE PURPOSE: Unit tests for StatusBadge component
 *
 * WHY: Shared component used across web + admin — must not regress.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../src/status-badge';

/**
 * Convert hex color to the RGB string that jsdom returns via style.backgroundColor.
 * This lets tests document the expected hex value while comparing against jsdom's conversion.
 */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe('StatusBadge', () => {
  it('renders status text by default', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeDefined();
  });

  it('renders custom label when provided', () => {
    render(<StatusBadge status="active" label="Live" />);
    expect(screen.getByText('Live')).toBeDefined();
  });

  it('applies green background for active status', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe(hexToRgb('#22c55e'));
  });

  it('applies yellow background for draft status', () => {
    const { container } = render(<StatusBadge status="draft" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe(hexToRgb('#eab308'));
  });

  it('applies red background for deprecated status', () => {
    const { container } = render(<StatusBadge status="deprecated" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe(hexToRgb('#ef4444'));
  });
});
