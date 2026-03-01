/**
 * Unit tests for NavLink component (active-state link for web + admin nav).
 *
 * Mocks next/navigation (usePathname) and next/link to test active class logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NavLink } from '../src/nav-link';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) {
    return <a href={href} className={className}>{children}</a>;
  },
}));

describe('NavLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders children and href', () => {
    mockUsePathname.mockReturnValue('/');
    render(
      <NavLink href="/costs" className="nav" activeClassName="active">
        Costs
      </NavLink>,
    );
    const link = screen.getByRole('link', { name: 'Costs' });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/costs');
  });

  it('applies activeClassName when pathname matches href (exact)', () => {
    mockUsePathname.mockReturnValue('/');
    render(
      <NavLink href="/" exact className="nav" activeClassName="active">
        Home
      </NavLink>,
    );
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.className).toContain('active');
  });

  it('does not apply activeClassName when pathname does not match (exact)', () => {
    mockUsePathname.mockReturnValue('/costs');
    render(
      <NavLink href="/" exact className="nav" activeClassName="active">
        Home
      </NavLink>,
    );
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link.className).not.toContain('active');
  });

  it('applies activeClassName when pathname starts with href (prefix match)', () => {
    mockUsePathname.mockReturnValue('/costs');
    render(
      <NavLink href="/costs" className="nav" activeClassName="active">
        Costs
      </NavLink>,
    );
    const link = screen.getByRole('link', { name: 'Costs' });
    expect(link.className).toContain('active');
  });

  it('applies activeClassName when pathname is subpath of href', () => {
    mockUsePathname.mockReturnValue('/costs/breakdown');
    render(
      <NavLink href="/costs" className="nav" activeClassName="active">
        Costs
      </NavLink>,
    );
    const link = screen.getByRole('link', { name: 'Costs' });
    expect(link.className).toContain('active');
  });

  it('does not apply activeClassName when pathname is different', () => {
    mockUsePathname.mockReturnValue('/prompts');
    render(
      <NavLink href="/costs" className="nav" activeClassName="active">
        Costs
      </NavLink>,
    );
    const link = screen.getByRole('link', { name: 'Costs' });
    expect(link.className).not.toContain('active');
  });
});
