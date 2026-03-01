/**
 * FILE PURPOSE: Few-shot bank CRUD + batch builder
 *
 * WHY: STRATEGY pillar §20 — curate high-quality examples from production
 *      generations for use as few-shot prompts. Closes the feedback→quality loop.
 *
 * HOW: CRUD on few_shot_bank table. Build endpoint auto-curates from
 *      top-scoring generations (qualityScore ≥ threshold + positive thumbs).
 *
 * Routes:
 *   GET    /api/few-shot?taskType=...&limit=5  — get active examples
 *   POST   /api/few-shot                        — manually add example
 *   POST   /api/few-shot/build                  — auto-curate from top generations
 *   DELETE /api/few-shot/:id                    — soft-delete (isActive=false)
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, and, desc, gte, isNotNull } from 'drizzle-orm';
import { db, fewShotBank, aiGenerations } from '../db/index.js';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

export async function handleFewShotRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  try {
  const parsedUrl = new URL(url, 'http://localhost');

  // POST /api/few-shot/build
  if (parsedUrl.pathname === '/api/few-shot/build' && req.method === 'POST') {
    const body = await parseBody(req);
    const taskType = body.taskType as string | undefined;
    const minQualityScore = (body.minQualityScore as number) ?? 0.85;
    const limit = Math.min((body.limit as number) ?? 20, 50);

    if (!taskType) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: taskType' }));
      return;
    }

    // Query top-scoring generations with positive feedback
    const candidates = await db
      .select()
      .from(aiGenerations)
      .where(and(
        eq(aiGenerations.taskType, taskType),
        gte(aiGenerations.qualityScore, minQualityScore.toFixed(2)),
        gte(aiGenerations.thumbs, 1),
        isNotNull(aiGenerations.userFeedback),
      ))
      .orderBy(desc(aiGenerations.qualityScore))
      .limit(limit);

    let added = 0;
    for (const gen of candidates) {
      // Check if already curated
      const [existing] = await db
        .select({ id: fewShotBank.id })
        .from(fewShotBank)
        .where(eq(fewShotBank.sourceGenerationId, gen.id))
        .limit(1);

      if (existing) continue;

      await db.insert(fewShotBank).values({
        taskType,
        inputText: gen.promptHash, // Hash reference — full text stored in generation
        outputText: gen.responseHash,
        qualityScore: gen.qualityScore ?? '0.85',
        sourceGenerationId: gen.id,
        curatedBy: 'auto',
        metadata: {
          model: gen.model,
          latencyMs: gen.latencyMs,
          thumbs: gen.thumbs,
        },
      });
      added++;
    }

    res.end(JSON.stringify({
      taskType,
      candidatesFound: candidates.length,
      added,
    }));
    return;
  }

  // DELETE /api/few-shot/:id
  const deleteMatch = parsedUrl.pathname.match(/^\/api\/few-shot\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const id = deleteMatch[1]!;

    const [updated] = await db
      .update(fewShotBank)
      .set({ isActive: false })
      .where(eq(fewShotBank.id, id))
      .returning();

    if (!updated) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Few-shot example not found: ${id}` }));
      return;
    }

    res.end(JSON.stringify({ deactivated: id }));
    return;
  }

  // GET /api/few-shot?taskType=...&limit=5
  if (parsedUrl.pathname === '/api/few-shot' && req.method === 'GET') {
    const taskType = parsedUrl.searchParams.get('taskType');
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') ?? '5', 10), 20);

    if (!taskType) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required query param: taskType' }));
      return;
    }

    const rows = await db
      .select()
      .from(fewShotBank)
      .where(and(
        eq(fewShotBank.taskType, taskType),
        eq(fewShotBank.isActive, true),
      ))
      .orderBy(desc(fewShotBank.qualityScore))
      .limit(limit);

    res.end(JSON.stringify(rows));
    return;
  }

  // POST /api/few-shot
  if (parsedUrl.pathname === '/api/few-shot' && req.method === 'POST') {
    const body = await parseBody(req);
    const taskType = body.taskType as string | undefined;
    const inputText = body.inputText as string | undefined;
    const outputText = body.outputText as string | undefined;
    const qualityScore = body.qualityScore as number | undefined;

    if (!taskType || !inputText || !outputText) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: taskType, inputText, outputText' }));
      return;
    }

    const [created] = await db
      .insert(fewShotBank)
      .values({
        taskType,
        inputText,
        outputText,
        qualityScore: (qualityScore ?? 1.0).toFixed(2),
        curatedBy: 'manual',
        metadata: (body.metadata as Record<string, unknown>) ?? null,
      })
      .returning();

    res.statusCode = 201;
    res.end(JSON.stringify(created));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in few-shot routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
