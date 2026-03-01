/**
 * FILE PURPOSE: EMBED processor — generates embeddings for document chunks
 * WHY: After ingestion, documents need vector embeddings for semantic search.
 *      Fetches doc → chunks text → embeds via LiteLLM → stores in DB.
 */

import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { IngestionJobData } from '@playbook/shared-llm';
import { createLLMClient, costLedger, selectChunker } from '@playbook/shared-llm';
import { db, documents, embeddings } from '../db/index.js';
import { resolveEmbeddingModelId, estimateTokens } from '../services/document-persistence.js';
import { checkTokenBudget } from '../rate-limiter.js';

export async function processEmbed(job: Job<IngestionJobData>): Promise<void> {
  const { documentId, payload } = job.data;
  const modelIdOverride = typeof payload.modelId === 'string' ? payload.modelId : undefined;

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new Error(`EMBED: Document not found: ${documentId}`);

  const rawText = doc.rawContent?.toString('utf-8');
  if (!rawText || rawText.length === 0) {
    process.stderr.write(`WARN: EMBED: Document ${documentId} has no raw content, skipping\n`);
    return;
  }

  const strategy = (doc.chunkStrategy ?? 'fixed') as 'fixed' | 'sliding-window' | 'per-entity' | 'semantic';
  const chunker = selectChunker(strategy);
  const chunks = chunker(rawText);
  const modelId = resolveEmbeddingModelId(rawText, modelIdOverride);
  const estimatedPromptTokens = estimateTokens(chunks.reduce((sum, c) => sum + c.length, 0));

  const budget = await checkTokenBudget('system:ingestion-worker', estimatedPromptTokens);
  if (!budget.allowed) {
    throw new Error(`EMBED: Token budget exceeded for ${documentId}`);
  }

  const startedAt = Date.now();
  const client = createLLMClient();
  const response = await client.embeddings.create({ model: modelId, input: chunks });
  const vectors = response.data.map((d) => d.embedding);

  const promptTokens = response.usage?.prompt_tokens
    ?? estimatedPromptTokens;
  costLedger.recordCall('worker-embed', modelId, promptTokens, 0, Date.now() - startedAt, true);

  // Atomic replace: delete old embeddings, insert new
  await db.delete(embeddings).where(eq(embeddings.sourceId, documentId));

  const rows = chunks.map((chunk, i) => ({
    sourceType: 'document' as const,
    sourceId: documentId,
    contentHash: createHash('sha256').update(chunk).digest('hex'),
    embedding: vectors[i]!,
    modelId,
    metadata: { chunkIndex: i, documentTitle: doc.title },
  }));
  await db.insert(embeddings).values(rows);

  await db.update(documents).set({
    chunkCount: chunks.length,
    embeddingModelId: modelId,
  }).where(eq(documents.id, documentId));

  process.stderr.write(`INFO: EMBED: ${documentId} — ${chunks.length} chunks embedded with ${modelId}\n`);
}
