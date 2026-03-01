/**
 * FILE PURPOSE: FRESHNESS processor — computes freshness multiplier for stale documents
 * WHY: Documents with validUntil dates degrade over time. The multiplier demotes
 *      stale content in search ranking without deleting it.
 */

import type { Job } from 'bullmq';
import { eq, isNotNull } from 'drizzle-orm';
import type { IngestionJobData } from '@playbook/shared-llm';
import { computeFreshnessMultiplier } from '@playbook/shared-llm';
import { db, documents } from '../db/index.js';

export async function processFreshness(job: Job<IngestionJobData>): Promise<void> {
  const { documentId, payload } = job.data;
  const isSweep = payload.sweep === true;

  if (isSweep) {
    await sweepAllDocuments();
    return;
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new Error(`FRESHNESS: Document not found: ${documentId}`);

  const multiplier = computeFreshnessMultiplier(doc.ingestedAt);
  const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;

  await db.update(documents).set({
    metadata: {
      ...existingMetadata,
      freshnessMultiplier: multiplier,
      freshnessCheckedAt: new Date().toISOString(),
    },
  }).where(eq(documents.id, documentId));

  process.stderr.write(`INFO: FRESHNESS: ${documentId} — multiplier=${multiplier}\n`);
}

async function sweepAllDocuments(): Promise<void> {
  const now = new Date();
  const staleDocs = await db.select({ id: documents.id, ingestedAt: documents.ingestedAt })
    .from(documents)
    .where(isNotNull(documents.validUntil));

  let updated = 0;
  for (const doc of staleDocs) {
    const multiplier = computeFreshnessMultiplier(doc.ingestedAt);
    if (multiplier < 1.0) {
      const [existing] = await db.select({ metadata: documents.metadata })
        .from(documents).where(eq(documents.id, doc.id)).limit(1);
      const meta = (existing?.metadata ?? {}) as Record<string, unknown>;

      await db.update(documents).set({
        metadata: { ...meta, freshnessMultiplier: multiplier, freshnessCheckedAt: now.toISOString() },
      }).where(eq(documents.id, doc.id));
      updated++;
    }
  }

  process.stderr.write(`INFO: FRESHNESS sweep: ${updated}/${staleDocs.length} documents updated\n`);
}
