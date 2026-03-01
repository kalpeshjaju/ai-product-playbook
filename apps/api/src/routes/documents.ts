/**
 * FILE PURPOSE: Document ingestion API routes — INPUT pillar
 *
 * WHY: Playbook §19 — documents must be ingested, chunked, and embedded
 *      before they can be used in RAG pipelines. This is the foundation
 *      of the INPUT pillar.
 *
 * HOW: POST accepts text content, chunks it, generates embeddings via
 *      LiteLLM proxy, and stores both the document and embedding rows.
 *      Dedup via SHA-256 content hash. Fail-open if embedding generation fails.
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

import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db, documents, embeddings } from '../db/index.js';
import { createLLMClient, createUserContext, withLangfuseHeaders, parseDocument, isSupportedMimeType } from '@playbook/shared-llm';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

/** Default embedding model — §19 HARD GATE: vectors must be tagged with model_id. */
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Configurable chunk defaults. Override per-request or via env vars. */
const DEFAULT_CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE_CHARS ?? '2000', 10);
const DEFAULT_CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP_CHARS ?? '200', 10);

/**
 * Simple recursive character text splitter.
 * Produces ~500 token chunks with 50 token overlap.
 * Approximation: 1 token ≈ 4 characters.
 * Configurable via env vars CHUNK_SIZE_CHARS / CHUNK_OVERLAP_CHARS or per-request.
 */
function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP): string[] {
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
  try {
    const client = createLLMClient(langfuseHeaders ? { headers: langfuseHeaders } : undefined);
    const response = await client.embeddings.create({
      model: modelId,
      input: chunks,
    });
    return response.data.map((d) => d.embedding);
  } catch {
    // Fail-open: if LiteLLM is down, document still stored without embeddings
    return null;
  }
}

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

    // Read raw body
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

    const modelId = DEFAULT_EMBEDDING_MODEL;
    const contentHash = createHash('sha256').update(parsed.text).digest('hex');

    // Dedup
    const [existing] = await db
      .select()
      .from(documents)
      .where(eq(documents.contentHash, contentHash))
      .limit(1);

    if (existing) {
      res.end(JSON.stringify({ duplicate: true, document: existing }));
      return;
    }

    const chunks = chunkText(parsed.text);
    const embeddingVectors = await generateEmbeddings(chunks, modelId, langfuseHeaders);
    const embeddingSucceeded = embeddingVectors !== null;

    const [doc] = await db
      .insert(documents)
      .values({
        title,
        mimeType: contentType,
        contentHash,
        chunkCount: embeddingSucceeded ? chunks.length : 0,
        embeddingModelId: embeddingSucceeded ? modelId : null,
        metadata: parsed.pageCount ? { pageCount: parsed.pageCount } : null,
      })
      .returning();

    if (embeddingSucceeded && embeddingVectors && doc) {
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

    res.statusCode = 201;
    res.end(JSON.stringify({
      document: doc,
      chunksCreated: embeddingSucceeded ? chunks.length : 0,
      embeddingsGenerated: embeddingSucceeded,
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
    const modelId = (body.modelId as string) ?? DEFAULT_EMBEDDING_MODEL;
    const validUntil = body.validUntil as string | undefined;
    const metadata = body.metadata as Record<string, unknown> | undefined;
    const chunkSize = typeof body.chunkSize === 'number' ? body.chunkSize : undefined;
    const chunkOverlap = typeof body.chunkOverlap === 'number' ? body.chunkOverlap : undefined;

    if (!title || !content) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: title, content' }));
      return;
    }

    // Dedup: check content hash
    const contentHash = createHash('sha256').update(content).digest('hex');
    const [existing] = await db
      .select()
      .from(documents)
      .where(eq(documents.contentHash, contentHash))
      .limit(1);

    if (existing) {
      res.end(JSON.stringify({ duplicate: true, document: existing }));
      return;
    }

    // Chunk the content (configurable per-request or via env defaults)
    const chunks = chunkText(content, chunkSize, chunkOverlap);

    // Generate embeddings (fail-open)
    const embeddingVectors = await generateEmbeddings(chunks, modelId, langfuseHeaders);
    const embeddingSucceeded = embeddingVectors !== null;

    // Insert the document
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
      })
      .returning();

    // Insert embedding rows if generation succeeded
    if (embeddingSucceeded && embeddingVectors && doc) {
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

    res.statusCode = 201;
    res.end(JSON.stringify({
      document: doc,
      chunksCreated: embeddingSucceeded ? chunks.length : 0,
      embeddingsGenerated: embeddingSucceeded,
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in document routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
