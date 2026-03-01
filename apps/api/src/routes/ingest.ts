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
import {
  IngesterRegistry,
  DocumentIngester,
  AudioIngester,
  ImageIngester,
  WebIngester,
  CsvIngester,
  ApiFeedIngester,
} from '@playbook/shared-llm';
import { persistDocument } from '../services/document-persistence.js';

const registry = new IngesterRegistry();
registry.register(new DocumentIngester());
registry.register(new AudioIngester());
registry.register(new ImageIngester());
registry.register(new WebIngester());
registry.register(new CsvIngester());
registry.register(new ApiFeedIngester());

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
