/**
 * FILE PURPOSE: PostHog-driven prompt A/B resolution
 *
 * WHY: Playbook §22 — bridges PostHog feature flags to the prompt_versions table.
 *      A single function that resolves "which prompt should this user see?"
 * HOW: Checks PostHog flag → queries prompt_versions for matching variant →
 *      falls back to weighted random selection if flag is off or unavailable.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { promptVersions } from '../db/schema.js';
import { getFeatureFlag, captureServerEvent } from './posthog.js';

/** Shape of a row from prompt_versions query. */
interface PromptVersionRow {
  id: string;
  promptName: string;
  version: string;
  content: string;
  contentHash: string;
  evalScore: string | null;
  activePct: number;
  author: string;
  createdAt: Date;
}

export interface PromptResolution {
  /** Prompt version string (e.g., "v1.2.0") */
  version: string;
  /** The actual prompt content */
  content: string;
  /** Variant name from PostHog flag (e.g., "control", "variant-a") or "weighted" */
  variant: string;
  /** How this prompt was selected */
  source: 'posthog-flag' | 'weighted-random' | 'single-active';
}

/**
 * Weighted random selection from active prompt versions.
 * Matches the logic in routes/prompts.ts.
 */
function weightedRandom<T extends { activePct: number }>(items: T[]): T | undefined {
  const total = items.reduce((acc, item) => acc + item.activePct, 0);
  if (total === 0) return items[0];

  let random = Math.random() * total;
  for (const item of items) {
    random -= item.activePct;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Resolve which prompt version to serve for a given user + prompt name.
 *
 * Resolution order:
 * 1. PostHog flag `prompt_{promptName}` → match variant to prompt version
 * 2. Weighted random across active versions (activePct > 0)
 * 3. null if no active versions exist
 *
 * @param userId - Distinct user ID for PostHog flag evaluation
 * @param promptName - The prompt name to resolve (matches prompt_versions.prompt_name)
 */
export async function resolvePromptWithAB(
  userId: string,
  promptName: string,
  providedActiveVersions?: PromptVersionRow[],
): Promise<PromptResolution | null> {
  // Fetch all active versions for this prompt
  const activeVersions = providedActiveVersions ?? await db
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.promptName, promptName), gt(promptVersions.activePct, 0))) as PromptVersionRow[];

  if (activeVersions.length === 0) return null;

  // Single active version — no A/B needed
  if (activeVersions.length === 1) {
    const single = activeVersions[0]!;
    return {
      version: single.version,
      content: single.content,
      variant: 'control',
      source: 'single-active',
    };
  }

  // Try PostHog flag resolution
  const flagKey = `prompt_${promptName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const flagValue = await getFeatureFlag(flagKey, userId);

  if (typeof flagValue === 'string' && flagValue.length > 0) {
    // Flag returned a variant name — match to a prompt version
    const matched = activeVersions.find((v: PromptVersionRow) => v.version === flagValue);
    if (matched) {
      captureServerEvent(userId, 'prompt_variant_served', {
        prompt_name: promptName,
        version: matched.version,
        variant: flagValue,
        source: 'posthog-flag',
      });
      return {
        version: matched.version,
        content: matched.content,
        variant: flagValue,
        source: 'posthog-flag',
      };
    }
  }

  // Fallback: weighted random selection
  const selected = weightedRandom(activeVersions);
  if (!selected) return null;

  captureServerEvent(userId, 'prompt_variant_served', {
    prompt_name: promptName,
    version: selected.version,
    variant: 'weighted',
    source: 'weighted-random',
  });

  return {
    version: selected.version,
    content: selected.content,
    variant: 'weighted',
    source: 'weighted-random',
  };
}
