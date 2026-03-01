/**
 * FILE PURPOSE: Embedding search + direct insertion API routes
 *
 * WHY: Playbook §19 — semantic search across all embedded content.
 *      §19 HARD GATE: never mix vectors from different models.
 *      modelId is required on every search to enforce this.
 *
 * HOW: Cosine similarity search via raw SQL (Drizzle doesn't support
 *      pgvector's <=> operator). Direct insertion for manual embeddings.
 *
 * Routes:
 *   GET  /api/embeddings/search?q=...&limit=10&modelId=... — semantic search
 *   POST /api/embeddings                                    — direct embedding insertion
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sql } from 'drizzle-orm';
import { db, embeddings } from '../db/index.js';
import { createLLMClient, createUserContext, withLangfuseHeaders } from '@playbook/shared-llm';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

/** Embed a query string using the specified model. */
async function embedQuery(query: string, modelId: string, langfuseHeaders?: Record<string, string>): Promise<number[] | null> {
  try {
    const client = createLLMClient(langfuseHeaders ? { headers: langfuseHeaders } : undefined);
    const response = await client.embeddings.create({
      model: modelId,
      input: query,
    });
    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export async function handleEmbeddingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  const parsedUrl = new URL(url, 'http://localhost');
  const userCtx = createUserContext(req);
  const langfuseHeaders: Record<string, string> = { ...withLangfuseHeaders(userCtx) };

  // GET /api/embeddings/search?q=...&limit=10&modelId=...
  if (parsedUrl.pathname === '/api/embeddings/search' && req.method === 'GET') {
    const query = parsedUrl.searchParams.get('q');
    const modelId = parsedUrl.searchParams.get('modelId');
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') ?? '10', 10), 50);

    if (!query) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required query param: q' }));
      return;
    }

    // §19 HARD GATE: modelId is required — never mix vectors from different models
    if (!modelId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required query param: modelId (§19 HARD GATE: never mix vectors from different models)' }));
      return;
    }

    // Embed the query
    const queryEmbedding = await embedQuery(query, modelId, langfuseHeaders);
    if (!queryEmbedding) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'Failed to generate query embedding — LiteLLM proxy may be unavailable' }));
      return;
    }

    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Cosine similarity search via raw SQL
    const results = await db.execute(sql`
      SELECT id, source_type, source_id, metadata,
             1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM embeddings
      WHERE model_id = ${modelId}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    res.end(JSON.stringify(results));
    return;
  }

  // POST /api/embeddings
  if (parsedUrl.pathname === '/api/embeddings' && req.method === 'POST') {
    const body = await parseBody(req);
    const sourceType = body.sourceType as string | undefined;
    const sourceId = body.sourceId as string | undefined;
    const contentHash = body.contentHash as string | undefined;
    const embedding = body.embedding as number[] | undefined;
    const modelId = body.modelId as string | undefined;
    const metadata = body.metadata as Record<string, unknown> | undefined;

    if (!sourceType || !sourceId || !contentHash || !embedding || !modelId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: sourceType, sourceId, contentHash, embedding, modelId' }));
      return;
    }

    const [created] = await db
      .insert(embeddings)
      .values({
        sourceType,
        sourceId,
        contentHash,
        embedding,
        modelId,
        metadata: metadata ?? null,
      })
      .returning();

    res.statusCode = 201;
    res.end(JSON.stringify(created));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
