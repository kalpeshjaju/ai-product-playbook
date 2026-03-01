/**
 * FILE PURPOSE: RE_EMBED processor — re-generates embeddings with a new model
 * WHY: When switching embedding models (e.g. small → large), existing documents
 *      need re-vectorization. Atomic delete+insert avoids mixed-model indices.
 */

import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { IngestionJobData } from '@playbook/shared-llm';
import { createLLMClient, costLedger, selectChunker } from '@playbook/shared-llm';
import { db, documents, embeddings } from '../db/index.js';
import { estimateTokens } from '../services/document-persistence.js';
import { checkTokenBudget } from '../rate-limiter.js';

export async function processReEmbed(job: Job<IngestionJobData>): Promise<void> {
  const { documentId, payload } = job.data;
  const newModelId = typeof payload.newModelId === 'string' ? payload.newModelId : undefined;
  if (!newModelId) throw new Error(`RE_EMBED: Missing required payload.newModelId for ${documentId}`);

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new Error(`RE_EMBED: Document not found: ${documentId}`);

  const rawText = doc.rawContent?.toString('utf-8');
  if (!rawText || rawText.length === 0) {
    process.stderr.write(`WARN: RE_EMBED: Document ${documentId} has no raw content, skipping\n`);
    return;
  }

  const strategy = (doc.chunkStrategy ?? 'fixed') as 'fixed' | 'sliding-window' | 'per-entity' | 'semantic';
  const chunker = selectChunker(strategy);
  const chunks = chunker(rawText);
  const estimatedPromptTokens = estimateTokens(chunks.reduce((sum, c) => sum + c.length, 0));

  const budget = await checkTokenBudget('system:ingestion-worker', estimatedPromptTokens);
  if (!budget.allowed) {
    throw new Error(`RE_EMBED: Token budget exceeded for ${documentId}`);
  }

  const startedAt = Date.now();
  const client = createLLMClient();
  const response = await client.embeddings.create({ model: newModelId, input: chunks });
  const vectors = response.data.map((d) => d.embedding);

  const promptTokens = response.usage?.prompt_tokens
    ?? estimatedPromptTokens;
  costLedger.recordCall('worker-re-embed', newModelId, promptTokens, 0, Date.now() - startedAt, true);

  // Atomic replace: delete old, insert new
  await db.delete(embeddings).where(eq(embeddings.sourceId, documentId));

  const rows = chunks.map((chunk, i) => ({
    sourceType: 'document' as const,
    sourceId: documentId,
    contentHash: createHash('sha256').update(chunk).digest('hex'),
    embedding: vectors[i]!,
    modelId: newModelId,
    metadata: { chunkIndex: i, documentTitle: doc.title },
  }));
  await db.insert(embeddings).values(rows);

  await db.update(documents).set({
    chunkCount: chunks.length,
    embeddingModelId: newModelId,
  }).where(eq(documents.id, documentId));

  process.stderr.write(`INFO: RE_EMBED: ${documentId} — re-embedded with ${newModelId}\n`);
}
