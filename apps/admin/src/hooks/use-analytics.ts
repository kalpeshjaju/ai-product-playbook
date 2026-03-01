/**
 * FILE PURPOSE: Self-contained analytics hook for admin panel
 *
 * WHY: Admin doesn't depend on @playbook/shared-llm (backend-heavy).
 *      This wraps posthog.capture() directly — fail-silent.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

'use client';

import posthog from 'posthog-js';

/** Track an analytics event. No-op when PostHog not initialized. Never throws. */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.capture(event, properties);
    }
  } catch {
    // Fail-silent: analytics must never break the app
  }
}
