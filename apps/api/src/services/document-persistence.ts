/**
 * FILE PURPOSE: Shared document persistence pipeline — dedup, chunk, embed, store
 *
 * WHY: Both /api/documents and /api/ingest need the same dedup → chunk → embed → DB insert
 *      pipeline. Extracting to a service eliminates duplication and ensures consistency.
 *
 * HOW: Single function `persistDocument()` runs the full pipeline:
 *      1. Dedup check via SHA-256 content hash
 *      2. Chunk text (configurable size/overlap)
 *      3. Generate embeddings via LiteLLM proxy (fail-open)
 *      4. Insert document row
 *      5. Insert embedding rows
 *
 * Rate limiting: callers must call checkTokenBudget() before invoking persistDocument().
 *   - /api/documents: checks in route handler (documents.ts)
 *   - /api/ingest: checks in server.ts (line ~209, covers /api/ingest prefix)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, documents, embeddings } from '../db/index.js';
import {
  createLLMClient,
  costLedger,
  routeQuery,
} from '@playbook/shared-llm';

// ─── Constants ───

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_MODEL_BY_TIER = {
  fast: 'text-embedding-3-small',
  balanced: 'text-embedding-3-small',
  quality: 'text-embedding-3-large',
} as const;

const DEFAULT_CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE_CHARS ?? '2000', 10);
const DEFAULT_CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP_CHARS ?? '200', 10);

// ─── Types ───

export interface PersistDocumentInput {
  title: string;
  content: string;
  mimeType?: string;
  sourceUrl?: string;
  sourceType?: string;
  modelId?: string;
  validUntil?: string;
  metadata?: Record<string, unknown>;
  chunkSize?: number;
  chunkOverlap?: number;
  langfuseHeaders?: Record<string, string>;
}

export interface PersistDocumentResult {
  documentId: string;
  persisted: boolean;
  duplicate: boolean;
  chunksCreated: number;
  embeddingsGenerated: boolean;
  embeddingModelId: string | null;
  contentHash: string;
  partialFailure: boolean;
}

// ─── Utility functions ───

/** Rough estimate for input tokens when provider usage metadata is unavailable. */
export function estimateTokens(charCount: number): number {
  return Math.max(1, Math.ceil(charCount / 4));
}

/**
 * Resolve the embedding model ID for ingestion.
 * If caller provides modelId, that always wins. Otherwise use RouteLLM
 * complexity tier to pick between small/large embedding models.
 */
export function resolveEmbeddingModelId(content: string, requestedModelId?: string): string {
  if (requestedModelId && requestedModelId.length > 0) return requestedModelId;

  const decision = routeQuery(content.slice(0, 4000), {
    taskType: 'extraction',
    defaultTier: 'balanced',
  });

  return EMBEDDING_MODEL_BY_TIER[decision.tier] ?? DEFAULT_EMBEDDING_MODEL;
}

/**
 * Simple recursive character text splitter.
 * Produces ~500 token chunks with 50 token overlap.
 * Approximation: 1 token ≈ 4 characters.
 */
export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }

  return chunks;
}

/** Generate embeddings for text chunks via LiteLLM proxy. */
async function generateEmbeddings(
  chunks: string[],
  modelId: string,
  langfuseHeaders?: Record<string, string>,
): Promise<number[][] | null> {
  const startedAt = Date.now();
  try {
    const client = createLLMClient(langfuseHeaders ? { headers: langfuseHeaders } : undefined);
    const response = await client.embeddings.create({
      model: modelId,
      input: chunks,
    });

    const promptTokens = response.usage?.prompt_tokens
      ?? estimateTokens(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    costLedger.recordCall(
      'documents-embeddings',
      modelId,
      promptTokens,
      0,
      Date.now() - startedAt,
      true,
    );
    return response.data.map((d) => d.embedding);
  } catch {
    costLedger.recordCall(
      'documents-embeddings',
      modelId,
      0,
      0,
      Date.now() - startedAt,
      false,
    );
    return null;
  }
}

// ─── Main persistence function ───

/**
 * Persist a document through the full pipeline: dedup → chunk → embed → DB insert.
 * Throws on DB failure (caller handles 5xx). Embedding failure is a partial success.
 */
export async function persistDocument(input: PersistDocumentInput): Promise<PersistDocumentResult> {
  const {
    title,
    content,
    mimeType = 'text/plain',
    sourceUrl,
    sourceType = 'document',
    modelId: requestedModelId,
    validUntil,
    metadata,
    chunkSize,
    chunkOverlap,
    langfuseHeaders,
  } = input;

  const contentHash = createHash('sha256').update(content).digest('hex');
  const modelId = resolveEmbeddingModelId(content, requestedModelId);

  // 1. Dedup check
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.contentHash, contentHash))
    .limit(1);

  if (existing) {
    return {
      documentId: existing.id,
      persisted: false,
      duplicate: true,
      chunksCreated: 0,
      embeddingsGenerated: false,
      embeddingModelId: null,
      contentHash,
      partialFailure: false,
    };
  }

  // 2. Chunk
  const chunks = chunkText(content, chunkSize, chunkOverlap);

  // 3. Embed (fail-open)
  const embeddingVectors = await generateEmbeddings(chunks, modelId, langfuseHeaders);
  const embeddingSucceeded = embeddingVectors !== null;

  // 4. Insert document row
  const [doc] = await db
    .insert(documents)
    .values({
      title,
      sourceUrl: sourceUrl ?? null,
      mimeType,
      contentHash,
      chunkCount: embeddingSucceeded ? chunks.length : 0,
      embeddingModelId: embeddingSucceeded ? modelId : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      metadata: metadata ?? null,
      sourceType,
    })
    .returning();

  if (!doc) {
    throw new Error('Document insert returned no rows');
  }

  // 5. Insert embedding rows
  if (embeddingSucceeded && embeddingVectors) {
    const embeddingRows = chunks.map((chunk, i) => ({
      sourceType: 'document' as const,
      sourceId: doc.id,
      contentHash: createHash('sha256').update(chunk).digest('hex'),
      embedding: embeddingVectors[i]!,
      modelId,
      metadata: { chunkIndex: i, documentTitle: title },
    }));
    await db.insert(embeddings).values(embeddingRows);
  }

  return {
    documentId: doc.id,
    persisted: true,
    duplicate: false,
    chunksCreated: embeddingSucceeded ? chunks.length : 0,
    embeddingsGenerated: embeddingSucceeded,
    embeddingModelId: embeddingSucceeded ? modelId : null,
    contentHash,
    partialFailure: !embeddingSucceeded,
  };
}
