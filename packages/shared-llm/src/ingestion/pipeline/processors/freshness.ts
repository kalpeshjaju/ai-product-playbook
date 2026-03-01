/**
 * FILE PURPOSE: FRESHNESS worker processor — checks document staleness
 * WHY: §19 — stale data in AI products is actively wrong output.
 *      Demotes stale docs in ranking, flags expired docs.
 */

import type { Job } from 'bullmq';
import type { IngestionJobData } from '../jobs.js';
import { computeFreshnessMultiplier } from '../../freshness.js';

export interface FreshnessDocInfo {
  ingestedAt: Date | null;
  validUntil: Date | null;
}

export interface FreshnessResult {
  documentId: string;
  status: 'fresh' | 'aging' | 'stale' | 'expired';
  freshnessMultiplier: number;
}

export async function processFreshness(
  job: Job<IngestionJobData>,
  docInfo: FreshnessDocInfo,
): Promise<FreshnessResult> {
  const { documentId } = job.data;
  const { ingestedAt, validUntil } = docInfo;

  // Check explicit expiry first
  if (validUntil && validUntil.getTime() < Date.now()) {
    await job.log(`Doc ${documentId} expired (valid_until: ${validUntil.toISOString()})`);
    return { documentId, status: 'expired', freshnessMultiplier: 0 };
  }

  const multiplier = computeFreshnessMultiplier(ingestedAt);

  let status: FreshnessResult['status'];
  if (multiplier >= 1.0) {
    status = 'fresh';
  } else if (multiplier >= 0.9) {
    status = 'aging';
  } else {
    status = 'stale';
  }

  await job.log(`Doc ${documentId}: ${status} (multiplier: ${multiplier})`);

  return { documentId, status, freshnessMultiplier: multiplier };
}
