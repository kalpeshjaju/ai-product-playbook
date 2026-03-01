/**
 * FILE PURPOSE: DEDUP_CHECK worker processor — hash + near dedup
 * WHY: §19 — exact hash dedup (trivial, always do) + near dedup (embedding similarity > 0.95).
 *      Idempotent: checking for duplicates has no side effects.
 */

import type { Job } from 'bullmq';
import type { IngestionJobData, DedupCheckPayload } from '../jobs.js';
import { isHashDuplicate } from '../../dedup/hash.js';
import { cosineSimilarity, NEAR_DEDUP_THRESHOLD } from '../../dedup/near.js';

export interface ExistingEmbedding {
  docId: string;
  embedding: number[];
}

export interface DedupCheckOptions {
  knownHashes?: Set<string>;
  existingEmbeddings?: ExistingEmbedding[];
}

export interface DedupCheckResult {
  documentId: string;
  isDuplicate: boolean;
  hashDuplicate: boolean;
  nearDuplicate: boolean;
  similarDocId?: string;
  similarity: number;
}

export async function processDedupCheck(
  job: Job<IngestionJobData>,
  options?: DedupCheckOptions,
): Promise<DedupCheckResult> {
  const { documentId } = job.data;
  const payload = job.data.payload as DedupCheckPayload;
  const { contentHash, embedding } = payload;
  const { knownHashes, existingEmbeddings } = options ?? {};

  // 1. Hash dedup (exact match)
  const hashDup = knownHashes ? isHashDuplicate(contentHash, knownHashes) : false;
  if (hashDup) {
    await job.log(`Hash duplicate detected for doc ${documentId}`);
    return {
      documentId, isDuplicate: true, hashDuplicate: true,
      nearDuplicate: false, similarity: 1.0,
    };
  }

  // 2. Near dedup (cosine similarity)
  if (embedding && existingEmbeddings && existingEmbeddings.length > 0) {
    let maxSimilarity = 0;
    let mostSimilarDocId: string | undefined;

    for (const existing of existingEmbeddings) {
      const sim = cosineSimilarity(embedding, existing.embedding);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        mostSimilarDocId = existing.docId;
      }
    }

    if (maxSimilarity >= NEAR_DEDUP_THRESHOLD) {
      await job.log(`Near-duplicate detected for doc ${documentId} (similarity: ${maxSimilarity.toFixed(4)})`);
      return {
        documentId, isDuplicate: true, hashDuplicate: false,
        nearDuplicate: true, similarDocId: mostSimilarDocId,
        similarity: maxSimilarity,
      };
    }
  }

  await job.log(`No duplicate found for doc ${documentId}`);
  return {
    documentId, isDuplicate: false, hashDuplicate: false,
    nearDuplicate: false, similarity: 0,
  };
}
