/**
 * FILE PURPOSE: Type-safe analytics hook for PostHog event tracking
 *
 * WHY: Wraps posthog.capture() with type safety from the shared event catalog.
 *      Fail-silent — analytics never breaks the app.
 *
 * HOW: Uses EVENTS and EventProperties from @playbook/shared-llm for
 *      compile-time event name + property validation.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

'use client';

import posthog from 'posthog-js';
import type { EventName, EventProperties } from '@playbook/shared-llm';

/**
 * Track an analytics event with type-safe properties.
 * No-op when PostHog is not initialized. Never throws.
 */
export function trackEvent<T extends EventName>(
  event: T,
  properties: EventProperties[T],
): void {
  try {
    if (typeof window !== 'undefined' && posthog.__loaded) {
      posthog.capture(event, properties);
    }
  } catch {
    // Fail-silent: analytics must never break the app
  }
}
