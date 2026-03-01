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
    expect(badge?.style.backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('applies yellow background for draft status', () => {
    const { container } = render(<StatusBadge status="draft" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe('rgb(234, 179, 8)');
  });

  it('applies red background for deprecated status', () => {
    const { container } = render(<StatusBadge status="deprecated" />);
    const badge = container.querySelector('span');
    expect(badge?.style.backgroundColor).toBe('rgb(239, 68, 68)');
  });
});
