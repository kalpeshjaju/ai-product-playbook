/**
 * FILE PURPOSE: PostHog analytics provider for Next.js client-side tracking.
 *
 * WHY: Product analytics (page views, feature usage, session replay).
 * HOW: Initializes posthog-js on the client. No-op when NEXT_PUBLIC_POSTHOG_KEY is not set.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */
"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!posthogKey) return;
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: "identified_only",
      capture_pageview: true,
      session_recording: {
        maskAllInputs: true,
      },
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") {
          ph.debug();
        }
      },
    });
  }, []);

  return <>{children}</>;
}

/**
 * Link a known user to their PostHog anonymous session.
 * Call after login / auth confirmation. No-op if PostHog is not initialized.
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, string>,
): void {
  if (!posthogKey) return;
  posthog.identify(userId, traits);
}

/**
 * Reset PostHog identity (call on logout).
 * Creates a new anonymous session so subsequent events aren't linked to the old user.
 */
export function resetIdentity(): void {
  if (!posthogKey) return;
  posthog.reset();
}
