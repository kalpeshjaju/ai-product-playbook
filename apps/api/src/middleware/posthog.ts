/**
 * FILE PURPOSE: PostHog Node SDK wrapper for server-side analytics + feature flags
 *
 * WHY: Playbook §22 Prompt A/B Testing — server-side flag evaluation enables
 *      prompt variant routing without client roundtrips. Bridges PostHog flags
 *      to the prompt_versions table.
 * HOW: Initializes PostHog Node client once at startup. Provides getFeatureFlag()
 *      for prompt A/B routing + captureServerEvent() for backend analytics.
 *      Fail-open when POSTHOG_SERVER_API_KEY not set — returns defaults.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { PostHog } from 'posthog-node';

let client: PostHog | undefined;

/**
 * Initialize PostHog server-side client.
 * Call once at server startup. No-op when API key not set.
 */
export function initPostHogServer(): void {
  const apiKey = process.env.POSTHOG_SERVER_API_KEY;
  if (!apiKey) {
    process.stderr.write('INFO: POSTHOG_SERVER_API_KEY not set — server-side PostHog disabled\n');
    return;
  }

  const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

  client = new PostHog(apiKey, {
    host,
    flushAt: 20,
    flushInterval: 10_000,
    personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
  });
}

/**
 * Evaluate a feature flag for a given user.
 * Returns the flag value (string variant or boolean) or undefined if PostHog is disabled.
 */
export async function getFeatureFlag(
  flagKey: string,
  distinctId: string,
  properties?: Record<string, string>,
): Promise<string | boolean | undefined> {
  if (!client) return undefined;

  try {
    const value = await client.getFeatureFlag(flagKey, distinctId, {
      personProperties: properties,
    });
    return value ?? undefined;
  } catch {
    process.stderr.write(`WARN: PostHog flag evaluation failed for "${flagKey}" — returning undefined\n`);
    return undefined;
  }
}

/**
 * Capture a server-side event (e.g., prompt variant served, model routed).
 * No-op when PostHog is disabled.
 */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (!client) return;
  client.capture({ distinctId, event, properties });
}

/**
 * Graceful shutdown — flushes pending events.
 * Call on SIGTERM / process exit.
 */
export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  await client.shutdown();
  client = undefined;
}
