/**
 * FILE PURPOSE: DEDUP_CHECK processor — flags near-duplicate documents via embedding similarity
 * WHY: Duplicate content wastes storage and degrades RAG relevance.
 *      Flags duplicates in metadata without deleting (human review).
 */

import type { Job } from 'bullmq';
import { eq, ne, and } from 'drizzle-orm';
import type { IngestionJobData } from '@playbook/shared-llm';
import { cosineSimilarity, NEAR_DEDUP_THRESHOLD } from '@playbook/shared-llm';
import { db, documents, embeddings } from '../db/index.js';

interface NearDuplicateMatch {
  documentId: string;
  similarity: number;
}

export async function processDedupCheck(job: Job<IngestionJobData>): Promise<void> {
  const { documentId } = job.data;

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new Error(`DEDUP_CHECK: Document not found: ${documentId}`);

  // Get first embedding for this document (representative vector)
  const docEmbeddings = await db.select()
    .from(embeddings)
    .where(eq(embeddings.sourceId, documentId))
    .limit(1);

  if (docEmbeddings.length === 0) {
    process.stderr.write(`WARN: DEDUP_CHECK: ${documentId} has no embeddings, skipping\n`);
    return;
  }

  const refVector = docEmbeddings[0]!.embedding;

  // Compare against embeddings from other documents (first chunk of each)
  const otherEmbeddings = await db.select({
    sourceId: embeddings.sourceId,
    embedding: embeddings.embedding,
  })
    .from(embeddings)
    .where(and(
      ne(embeddings.sourceId, documentId),
      eq(embeddings.metadata, { chunkIndex: 0 } as unknown as typeof embeddings.metadata._.data),
    ))
    .limit(100);

  const nearDuplicates: NearDuplicateMatch[] = [];
  for (const other of otherEmbeddings) {
    const sim = cosineSimilarity(refVector, other.embedding);
    if (sim >= NEAR_DEDUP_THRESHOLD) {
      nearDuplicates.push({ documentId: other.sourceId, similarity: Math.round(sim * 1000) / 1000 });
    }
  }

  const existingMetadata = (doc.metadata ?? {}) as Record<string, unknown>;
  await db.update(documents).set({
    metadata: {
      ...existingMetadata,
      nearDuplicates,
      dedupCheckedAt: new Date().toISOString(),
    },
  }).where(eq(documents.id, documentId));

  process.stderr.write(
    `INFO: DEDUP_CHECK: ${documentId} — ${nearDuplicates.length} near-duplicates found\n`,
  );
}
