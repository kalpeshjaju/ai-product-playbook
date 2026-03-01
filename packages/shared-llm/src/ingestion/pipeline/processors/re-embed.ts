/**
 * FILE PURPOSE: RE_EMBED worker processor — re-generates embeddings with a new model
 * WHY: §19 — model change requires re-indexing all vectors. Old and new vectors
 *      CANNOT be compared (different model = different vector space).
 *      This processor generates new vectors; the caller swaps them atomically.
 */

import type { Job } from 'bullmq';
import type { IngestionJobData, ReEmbedPayload } from '../jobs.js';
import { createLLMClient } from '../../../llm-client.js';
import { costLedger } from '../../../cost-ledger.js';

export interface ReEmbedOptions {
  chunks: string[];
}

export interface ReEmbedResult {
  documentId: string;
  oldModelId: string;
  newModelId: string;
  vectors: number[][];
}

export async function processReEmbed(
  job: Job<IngestionJobData>,
  options: ReEmbedOptions,
): Promise<ReEmbedResult> {
  const { documentId } = job.data;
  const payload = job.data.payload as ReEmbedPayload;
  const { oldModelId, newModelId } = payload;
  const { chunks } = options;

  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks to re-embed');
  }

  const startedAt = Date.now();
  const client = createLLMClient();

  const response = await client.embeddings.create({
    model: newModelId,
    input: chunks,
  });

  const promptTokens = response.usage?.prompt_tokens
    ?? Math.max(1, Math.ceil(chunks.join('').length / 4));

  costLedger.recordCall(
    'worker-re-embed',
    newModelId,
    promptTokens,
    0,
    Date.now() - startedAt,
    true,
  );

  const vectors = response.data.map((d) => d.embedding);

  await job.log(`Re-embedded doc ${documentId}: ${oldModelId} → ${newModelId} (${chunks.length} chunks)`);

  return { documentId, oldModelId, newModelId, vectors };
}
