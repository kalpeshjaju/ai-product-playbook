/**
 * FILE PURPOSE: Document ingestion API routes — INPUT pillar
 *
 * WHY: Playbook §19 — documents must be ingested, chunked, and embedded
 *      before they can be used in RAG pipelines. This is the foundation
 *      of the INPUT pillar.
 *
 * HOW: POST accepts text content, delegates to DocumentPersistenceService
 *      for dedup/chunk/embed/store. Token and cost budget checks stay
 *      in the route handler (request-scoped).
 *
 * rateLimited: server-level — checkTokenBudget + checkCostBudget applied in server.ts
 *
 * Routes:
 *   POST /api/documents          — ingest a document (chunk + embed)
 *   POST /api/documents/upload   — binary upload (PDF/DOCX) via Unstructured.io
 *   GET  /api/documents?limit=20 — list ingested documents
 *   GET  /api/documents/:id      — get single document metadata
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db, documents } from '../db/index.js';
import { checkTokenBudget } from '../rate-limiter.js';
import { checkCostBudget } from '../cost-guard.js';
import {
  createUserContext,
  withLangfuseHeaders,
  parseDocument,
  isSupportedMimeType,
} from '@playbook/shared-llm';
import {
  persistDocument,
  estimateTokens,
} from '../services/document-persistence.js';
import { handleRouteError, type BodyParser } from '../types.js';

export async function handleDocumentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  try {
  const parsedUrl = new URL(url, 'http://localhost');
  const userCtx = createUserContext(req);
  const langfuseHeaders: Record<string, string> = { ...withLangfuseHeaders(userCtx) };

  // GET /api/documents/:id
  const idMatch = parsedUrl.pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (idMatch && req.method === 'GET') {
    const id = idMatch[1]!;
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!doc) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Document not found: ${id}` }));
      return;
    }

    res.end(JSON.stringify(doc));
    return;
  }

  // GET /api/documents?limit=20&offset=0
  if (parsedUrl.pathname === '/api/documents' && req.method === 'GET') {
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(parsedUrl.searchParams.get('offset') ?? '0', 10);

    const rows = await db
      .select()
      .from(documents)
      .orderBy(desc(documents.ingestedAt))
      .limit(limit)
      .offset(offset);

    res.end(JSON.stringify(rows));
    return;
  }

  // POST /api/documents/upload — binary document upload (PDF/DOCX)
  if (parsedUrl.pathname === '/api/documents/upload' && req.method === 'POST') {
    const contentType = typeof req.headers['content-type'] === 'string'
      ? req.headers['content-type']
      : '';
    const title = typeof req.headers['x-document-title'] === 'string'
      ? req.headers['x-document-title']
      : 'Untitled';

    if (!isSupportedMimeType(contentType)) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        error: `Unsupported Content-Type: ${contentType}. Supported: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/markdown`,
      }));
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

    const parsed = await parseDocument(rawBody, contentType);
    if (!parsed) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'Document parsing failed — Unstructured.io may be unavailable' }));
      return;
    }

    // Token/cost budget checks (request-scoped)
    const estimated = estimateTokens(parsed.text.length);
    const tokenBudget = await checkTokenBudget(userCtx.userId, estimated);
    if (!tokenBudget.allowed) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        error: 'Token budget exceeded',
        daily_limit: tokenBudget.limit,
        remaining: tokenBudget.remaining,
      }));
      return;
    }

    const costCheck = checkCostBudget();
    if (!costCheck.allowed) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        error: 'Cost budget exceeded',
        report: costCheck.report,
      }));
      return;
    }

    const result = await persistDocument({
      title,
      content: parsed.text,
      mimeType: contentType,
      metadata: parsed.pageCount ? { pageCount: parsed.pageCount } : undefined,
      langfuseHeaders,
    });

    if (result.duplicate) {
      res.end(JSON.stringify({ duplicate: true, documentId: result.documentId }));
      return;
    }

    res.statusCode = 201;
    res.end(JSON.stringify({
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      embeddingsGenerated: result.embeddingsGenerated,
      parsedPageCount: parsed.pageCount,
    }));
    return;
  }

  // POST /api/documents
  if (parsedUrl.pathname === '/api/documents' && req.method === 'POST') {
    const body = await parseBody(req);
    const title = body.title as string | undefined;
    const content = body.content as string | undefined;
    const sourceUrl = body.sourceUrl as string | undefined;
    const mimeType = (body.mimeType as string) ?? 'text/plain';
    const modelId = body.modelId as string | undefined;
    const validUntil = body.validUntil as string | undefined;
    const metadata = body.metadata as Record<string, unknown> | undefined;
    const chunkSize = typeof body.chunkSize === 'number' ? body.chunkSize : undefined;
    const chunkOverlap = typeof body.chunkOverlap === 'number' ? body.chunkOverlap : undefined;

    if (!title || !content) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: title, content' }));
      return;
    }

    // Token/cost budget checks (request-scoped)
    const estimated = estimateTokens(content.length);
    const tokenBudget = await checkTokenBudget(userCtx.userId, estimated);
    if (!tokenBudget.allowed) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        error: 'Token budget exceeded',
        daily_limit: tokenBudget.limit,
        remaining: tokenBudget.remaining,
      }));
      return;
    }

    const costCheck = checkCostBudget();
    if (!costCheck.allowed) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        error: 'Cost budget exceeded',
        report: costCheck.report,
      }));
      return;
    }

    const result = await persistDocument({
      title,
      content,
      mimeType,
      sourceUrl,
      modelId,
      validUntil,
      metadata,
      chunkSize,
      chunkOverlap,
      langfuseHeaders,
    });

    if (result.duplicate) {
      res.end(JSON.stringify({ duplicate: true, documentId: result.documentId }));
      return;
    }

    res.statusCode = 201;
    res.end(JSON.stringify({
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      embeddingsGenerated: result.embeddingsGenerated,
      embeddingModelId: result.embeddingModelId,
      contentHash: result.contentHash,
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    handleRouteError(res, 'document', err);
  }
}
