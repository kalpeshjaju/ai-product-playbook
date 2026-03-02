/**
 * FILE PURPOSE: Weighted random selection utility
 *
 * WHY: Used by both prompt A/B routes and PostHog-driven prompt resolution.
 *      Extracted here to avoid identical copies in two files.
 */

/** Weighted random selection from items with an activePct field. */
export function weightedRandom<T extends { activePct: number }>(items: T[]): T | undefined {
  const total = items.reduce((acc, item) => acc + item.activePct, 0);
  if (total === 0) return items[0];

  let random = Math.random() * total;
  for (const item of items) {
    random -= item.activePct;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}
