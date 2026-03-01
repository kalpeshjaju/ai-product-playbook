/**
 * FILE PURPOSE: Next.js middleware with optional Clerk auth
 *
 * WHY: Clerk middleware handles session cookies, token refresh, and route protection.
 * HOW: Clerk is optional in local dev — if NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set,
 *      middleware is a no-op. This matches the job-matchmaker pattern.
 */

import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

const hasClerkPublishableKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const clerk = hasClerkPublishableKey ? clerkMiddleware() : null;

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!clerk) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
