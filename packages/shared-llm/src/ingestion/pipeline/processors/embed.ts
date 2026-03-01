/**
 * FILE PURPOSE: EMBED worker processor — generates embeddings for document chunks
 * WHY: §19 — async embedding generation via BullMQ. Idempotent (safe to retry).
 *      Tags every vector with model_id (§19 HARD GATE).
 */

import type { Job } from 'bullmq';
import type { IngestionJobData, EmbedPayload } from '../jobs.js';
import { createLLMClient } from '../../../llm-client.js';
import { costLedger } from '../../../cost-ledger.js';

export interface EmbedResult {
  vectors: number[][];
  modelId: string;
  documentId: string;
}

export async function processEmbed(job: Job<IngestionJobData>): Promise<EmbedResult> {
  const { documentId } = job.data;
  const payload = job.data.payload as EmbedPayload;
  const { modelId, chunks } = payload;

  if (!chunks || chunks.length === 0) {
    throw new Error('No chunks to embed');
  }

  const startedAt = Date.now();
  const client = createLLMClient();

  const response = await client.embeddings.create({
    model: modelId,
    input: chunks,
  });

  const promptTokens = response.usage?.prompt_tokens
    ?? Math.max(1, Math.ceil(chunks.join('').length / 4));

  costLedger.recordCall(
    'worker-embed',
    modelId,
    promptTokens,
    0,
    Date.now() - startedAt,
    true,
  );

  const vectors = response.data.map((d) => d.embedding);

  await job.log(`Embedded ${chunks.length} chunks with ${modelId} for doc ${documentId}`);

  return { vectors, modelId, documentId };
}
