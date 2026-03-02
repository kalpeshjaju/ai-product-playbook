/**
 * FILE PURPOSE: Unified ingestion API route — accepts any supported MIME type
 * WHY: §19 — single entry point for all input modalities. Dispatches via IngesterRegistry.
 *      Now persists parsed content to DB via DocumentPersistenceService.
 *
 * Routes:
 *   POST /api/ingest — ingest content of any supported type (persists to DB)
 *   GET  /api/ingest/types — list supported MIME types
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Queue } from 'bullmq';
import { and, eq, ne } from 'drizzle-orm';
import type { IngestionJobData } from '@playbook/shared-llm';
import {
  IngesterRegistry,
  DocumentIngester,
  AudioIngester,
  ImageIngester,
  WebIngester,
  CsvIngester,
  ApiFeedIngester,
  createIngestionQueue,
  JobType,
} from '@playbook/shared-llm';
import { persistDocument } from '../services/document-persistence.js';
import { db, documents, embeddings } from '../db/index.js';

/** Lazy-initialized queue — only created when REDIS_URL is set */
let ingestionQueue: Queue<IngestionJobData> | null = null;

function getQueue(): Queue<IngestionJobData> | null {
  if (ingestionQueue) return ingestionQueue;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  ingestionQueue = createIngestionQueue(redisUrl);
  return ingestionQueue;
}

const registry = new IngesterRegistry();
registry.register(new DocumentIngester());
registry.register(new AudioIngester());
registry.register(new ImageIngester());
registry.register(new WebIngester());
registry.register(new CsvIngester());
registry.register(new ApiFeedIngester());

const KNOWN_HASH_LIMIT = 500;
const EXISTING_EMBEDDING_LIMIT = 200;

async function buildDedupPayload(
  documentId: string,
  contentHash: string,
  embeddingModelId: string | null,
): Promise<{
  contentHash: string;
  embedding?: number[];
  knownHashes?: string[];
  existingEmbeddings?: Array<{ docId: string; embedding: number[] }>;
}> {
  const hashRows = await db
    .select({ contentHash: documents.contentHash })
    .from(documents)
    .where(ne(documents.id, documentId))
    .limit(KNOWN_HASH_LIMIT);

  const dedupPayload: {
    contentHash: string;
    embedding?: number[];
    knownHashes?: string[];
    existingEmbeddings?: Array<{ docId: string; embedding: number[] }>;
  } = {
    contentHash,
    knownHashes: hashRows.map((row) => row.contentHash),
  };

  if (!embeddingModelId) {
    return dedupPayload;
  }

  const [currentEmbedding] = await db
    .select({ embedding: embeddings.embedding })
    .from(embeddings)
    .where(and(
      eq(embeddings.sourceId, documentId),
      eq(embeddings.modelId, embeddingModelId),
    ))
    .limit(1);

  const existingEmbeddings = await db
    .select({ docId: embeddings.sourceId, embedding: embeddings.embedding })
    .from(embeddings)
    .where(and(
      eq(embeddings.modelId, embeddingModelId),
      ne(embeddings.sourceId, documentId),
    ))
    .limit(EXISTING_EMBEDDING_LIMIT);

  if (currentEmbedding?.embedding) {
    dedupPayload.embedding = currentEmbedding.embedding;
  }
  dedupPayload.existingEmbeddings = existingEmbeddings.map((row) => ({
    docId: row.docId,
    embedding: row.embedding,
  }));

  return dedupPayload;
}

async function enqueuePostIngestJobs(
  queue: Queue<IngestionJobData>,
  documentId: string,
  content: string,
  contentHash: string,
  embeddingModelId: string | null,
): Promise<boolean> {
  const dedupPayload = await buildDedupPayload(documentId, contentHash, embeddingModelId);
  const results = await Promise.allSettled([
    queue.add(JobType.ENRICH, {
      type: 'enrich',
      documentId,
      payload: { content },
    }),
    queue.add(JobType.DEDUP_CHECK, {
      type: 'dedup-check',
      documentId,
      payload: dedupPayload,
    }),
  ]);

  const failedJobs = results.filter((result) => result.status === 'rejected');
  if (failedJobs.length > 0) {
    for (const failure of failedJobs) {
      process.stderr.write(
        `WARN: Queue enqueue failed for doc ${documentId}: ${String(failure.reason)}\n`,
      );
    }
    return false;
  }

  return true;
}

export async function handleIngestRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<void> {
  try {
    const parsedUrl = new URL(url, 'http://localhost');

    // GET /api/ingest/types
    if (parsedUrl.pathname === '/api/ingest/types' && req.method === 'GET') {
      res.end(JSON.stringify({ supportedTypes: registry.supportedTypes() }));
      return;
    }

    // POST /api/ingest
    if (parsedUrl.pathname === '/api/ingest' && req.method === 'POST') {
      const contentType = typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type'].split(';')[0]!.trim()
        : '';

      if (!contentType) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Content-Type header required' }));
        return;
      }

      const rawBody = await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', () => resolve(Buffer.alloc(0)));
      });

      if (rawBody.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Empty body' }));
        return;
      }

      // Parse via IngesterRegistry
      const ingestResult = await registry.ingest(rawBody, contentType);
      if (!ingestResult) {
        res.statusCode = 422;
        res.end(JSON.stringify({
          error: `Unsupported or failed ingestion for Content-Type: ${contentType}`,
          supportedTypes: registry.supportedTypes(),
        }));
        return;
      }

      // Persist parsed content to DB via DocumentPersistenceService
      const title = typeof req.headers['x-document-title'] === 'string'
        ? req.headers['x-document-title']
        : `Ingested ${ingestResult.sourceType}`;

      const persistResult = await persistDocument({
        title,
        content: ingestResult.text,
        mimeType: ingestResult.mimeType,
        sourceType: ingestResult.sourceType,
        metadata: ingestResult.metadata
          ? { ...ingestResult.metadata, ingestContentHash: ingestResult.contentHash }
          : { ingestContentHash: ingestResult.contentHash },
      });

      if (persistResult.duplicate) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          documentId: persistResult.documentId,
          persisted: false,
          duplicate: true,
          contentHash: persistResult.contentHash,
        }));
        return;
      }

      // Enqueue async enrichment jobs (fail-open — queue errors don't block ingest)
      const queue = getQueue();
      let queued = false;
      if (queue && persistResult.persisted) {
        const docId = persistResult.documentId;
        try {
          queued = await enqueuePostIngestJobs(
            queue,
            docId,
            ingestResult.text,
            ingestResult.contentHash,
            persistResult.embeddingModelId,
          );
        } catch (err) {
          process.stderr.write(`WARN: Failed to enqueue async jobs for doc ${docId}: ${String(err)}\n`);
        }
      }

      // 207 if doc stored but embeddings failed; 201 for full success
      res.statusCode = persistResult.partialFailure ? 207 : 201;
      res.end(JSON.stringify({
        documentId: persistResult.documentId,
        persisted: persistResult.persisted,
        duplicate: false,
        chunksCreated: persistResult.chunksCreated,
        embeddingsGenerated: persistResult.embeddingsGenerated,
        embeddingModelId: persistResult.embeddingModelId,
        contentHash: persistResult.contentHash,
        queued,
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in ingest routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
