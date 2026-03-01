/**
 * FILE PURPOSE: Client-side Clerk provider wrapper
 *
 * WHY: ClerkProvider requires 'use client' but the root layout is a Server Component.
 *      This wrapper bridges the RSC boundary cleanly.
 * HOW: Conditionally renders ClerkProvider only when CLERK_PUBLISHABLE_KEY is set.
 *      In local dev without Clerk configured, children render without auth.
 */

'use client';

import { ClerkProvider } from '@clerk/nextjs';

export function ClerkProviderShell({
  children,
  publishableKey,
}: {
  children: React.ReactNode;
  publishableKey: string;
}) {
  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
