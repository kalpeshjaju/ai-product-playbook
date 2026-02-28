/**
 * FILE PURPOSE: PostHog analytics provider for admin panel.
 *
 * WHY: Track admin feature usage separately from public web app.
 * HOW: Same PostHog account, different project. No-op when key not set.
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
    });
  }, []);

  return <>{children}</>;
}
