/**
 * FILE PURPOSE: Freshness enforcement utilities for search and retrieval
 * WHY: §19 — stale data produces actively wrong AI output. Demote old docs in ranking.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function computeFreshnessMultiplier(ingestedAt: Date | null): number {
  if (!ingestedAt) return 1.0;
  const ageMs = Date.now() - ingestedAt.getTime();
  if (ageMs < THIRTY_DAYS_MS) return 1.0;
  if (ageMs < NINETY_DAYS_MS) return 0.9;
  return 0.8;
}
