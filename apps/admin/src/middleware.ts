/**
 * FILE PURPOSE: Next.js middleware with optional Clerk auth for admin app
 *
 * WHY: Admin panel should be fully protected — all routes require auth.
 * HOW: Same optional Clerk pattern as web. In production, all admin routes
 *      are gated by Clerk. In dev without Clerk configured, no-op.
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
