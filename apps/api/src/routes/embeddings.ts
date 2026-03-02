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
 * rateLimited: server-level — checkTokenBudget + checkCostBudget applied in server.ts
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
import { checkTokenBudget } from '../rate-limiter.js';
import { checkCostBudget } from '../cost-guard.js';
import { createLLMClient, withLangfuseHeaders, costLedger } from '@playbook/shared-llm';
import type { AuthResult } from '../middleware/auth.js';
import { handleRouteError, type BodyParser } from '../types.js';

/** Rough estimate for input tokens when provider usage metadata is unavailable. */
function estimateTokens(charCount: number): number {
  return Math.max(1, Math.ceil(charCount / 4));
}

/** Embed a query string using the specified model. */
async function embedQuery(query: string, modelId: string, langfuseHeaders?: Record<string, string>): Promise<number[] | null> {
  const startedAt = Date.now();
  try {
    const client = createLLMClient(langfuseHeaders ? { headers: langfuseHeaders } : undefined);
    const response = await client.embeddings.create({
      model: modelId,
      input: query,
    });

    const promptTokens = response.usage?.prompt_tokens ?? estimateTokens(query.length);
    costLedger.recordCall(
      'embeddings-search',
      modelId,
      promptTokens,
      0,
      Date.now() - startedAt,
      true,
    );
    return response.data[0]?.embedding ?? null;
  } catch {
    costLedger.recordCall(
      'embeddings-search',
      modelId,
      0,
      0,
      Date.now() - startedAt,
      false,
    );
    return null;
  }
}

export async function handleEmbeddingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
  authResult: AuthResult,
): Promise<void> {
  try {
  const parsedUrl = new URL(url, 'http://localhost');
  const userCtx = authResult.userContext;
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

    const tokenBudget = await checkTokenBudget(userCtx.userId, estimateTokens(query.length));
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

    // Embed the query
    const queryEmbedding = await embedQuery(query, modelId, langfuseHeaders);
    if (!queryEmbedding) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'Failed to generate query embedding — LiteLLM proxy may be unavailable' }));
      return;
    }

    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Cosine similarity search with freshness filter (§19 Input Pillar)
    const results = await db.execute(sql`
      SELECT e.id, e.source_type, e.source_id, e.metadata,
             1 - (e.embedding <=> ${vectorStr}::vector) AS similarity
      FROM embeddings e
      LEFT JOIN documents d ON e.source_id = d.id AND e.source_type = 'document'
      WHERE e.model_id = ${modelId}
        AND (d.valid_until IS NULL OR d.valid_until > NOW())
      ORDER BY e.embedding <=> ${vectorStr}::vector
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
  } catch (err) {
    handleRouteError(res, 'embedding', err);
  }
}
