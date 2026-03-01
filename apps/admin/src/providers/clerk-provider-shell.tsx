/**
 * FILE PURPOSE: Client-side Clerk provider wrapper for admin app
 *
 * WHY: ClerkProvider requires 'use client' but the root layout is a Server Component.
 * HOW: Same pattern as web app — wraps children in ClerkProvider.
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
