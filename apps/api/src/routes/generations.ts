/**
 * FILE PURPOSE: AI generation logging API routes
 *
 * WHY: Playbook §21 Plane 3 — every LLM call logged to ai_generations.
 *      Enables quality tracking, cost analysis, feedback loops, and eval baselines.
 *
 * HOW: POST creates a generation record via shared-llm's createGenerationLog.
 *      GET queries with pagination. GET /stats returns aggregated metrics.
 *
 * Routes:
 *   POST /api/generations                     — log an AI generation
 *   GET  /api/generations?userId=...&limit=20 — query history with pagination
 *   GET  /api/generations/stats?userId=...    — aggregated stats
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db, aiGenerations } from '../db/index.js';
import { createGenerationLog } from '@playbook/shared-llm';
import type { GenerationLogInput } from '@playbook/shared-llm';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

/** Validate required fields for generation logging. */
function validateGenerationInput(body: Record<string, unknown>): GenerationLogInput | string {
  const required = [
    'userId', 'promptText', 'promptVersion', 'taskType',
    'inputTokens', 'responseText', 'outputTokens', 'model',
    'modelVersion', 'latencyMs', 'costUsd',
  ] as const;

  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return `Required field missing: ${field}`;
    }
  }

  return {
    userId: body.userId as string,
    sessionId: body.sessionId as string | undefined,
    promptText: body.promptText as string,
    promptVersion: body.promptVersion as string,
    taskType: body.taskType as string,
    inputTokens: body.inputTokens as number,
    responseText: body.responseText as string,
    outputTokens: body.outputTokens as number,
    model: body.model as string,
    modelVersion: body.modelVersion as string,
    latencyMs: body.latencyMs as number,
    costUsd: body.costUsd as number,
    qualityScore: body.qualityScore as number | undefined,
    hallucination: body.hallucination as boolean | undefined,
    guardrailTriggered: body.guardrailTriggered as string[] | undefined,
  };
}

export async function handleGenerationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  try {
  const parsedUrl = new URL(url, 'http://localhost');

  // GET /api/generations/stats?userId=...&days=7
  if (parsedUrl.pathname === '/api/generations/stats' && req.method === 'GET') {
    const userId = parsedUrl.searchParams.get('userId');
    const days = parseInt(parsedUrl.searchParams.get('days') ?? '7', 10);

    if (!userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required query param: userId' }));
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const [stats] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${aiGenerations.latencyMs})::int, 0)`,
        avgQualityScore: sql<string | null>`avg(${aiGenerations.qualityScore})`,
        totalCostUsd: sql<string>`coalesce(sum(${aiGenerations.costUsd}), '0')`,
      })
      .from(aiGenerations)
      .where(and(
        eq(aiGenerations.userId, userId),
        gte(aiGenerations.createdAt, cutoff),
      ));

    res.end(JSON.stringify({
      totalCalls: stats?.totalCalls ?? 0,
      avgLatencyMs: stats?.avgLatencyMs ?? 0,
      avgQualityScore: stats?.avgQualityScore ? parseFloat(stats.avgQualityScore) : null,
      totalCostUsd: parseFloat(stats?.totalCostUsd ?? '0'),
    }));
    return;
  }

  // GET /api/generations?userId=...&limit=20&offset=0
  if (parsedUrl.pathname === '/api/generations' && req.method === 'GET') {
    const userId = parsedUrl.searchParams.get('userId');
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(parsedUrl.searchParams.get('offset') ?? '0', 10);

    if (!userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required query param: userId' }));
      return;
    }

    const rows = await db
      .select()
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, userId))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(limit)
      .offset(offset);

    res.end(JSON.stringify(rows));
    return;
  }

  // POST /api/generations
  if (parsedUrl.pathname === '/api/generations' && req.method === 'POST') {
    const body = await parseBody(req);
    const validated = validateGenerationInput(body);

    if (typeof validated === 'string') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: validated }));
      return;
    }

    const record = createGenerationLog(validated);
    const [created] = await db
      .insert(aiGenerations)
      .values(record)
      .returning();

    res.statusCode = 201;
    res.end(JSON.stringify(created));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in generation routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
