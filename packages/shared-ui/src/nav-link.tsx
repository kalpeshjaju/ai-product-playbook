// Client component for active-state nav link highlighting.
// Uses usePathname() from Next.js to match the current route.
// Shared by apps/web (top navbar) and apps/admin (sidebar nav).
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  exact?: boolean;
}

export function NavLink({
  href,
  children,
  className = '',
  activeClassName = '',
  exact = false,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/');

  const classes = [className, isActive ? activeClassName : ''].filter(Boolean).join(' ');

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
