/**
 * FILE PURPOSE: Feedback API routes for AI generation quality tracking
 *
 * WHY: Playbook §22 — feedback loops close the gap between generation and outcome.
 *      User feedback (thumbs, edits) feeds back into prompt evaluation and
 *      preference learning. Outcomes track downstream business impact.
 *
 * HOW: PATCH updates feedback columns on an existing ai_generations row.
 *      POST /outcome creates an outcomes row linked to a generation.
 *
 * Routes:
 *   PATCH /api/feedback/:generationId          — update feedback on a generation
 *   POST  /api/feedback/:generationId/outcome  — create an outcome linked to a generation
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import { db, aiGenerations, outcomes } from '../db/index.js';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

const VALID_FEEDBACK = ['accepted', 'rejected', 'edited', 'regenerated', 'ignored'] as const;
const VALID_THUMBS = [-1, 0, 1] as const;
const VALID_OUTCOME_TYPES = ['conversion', 'task_completed', 'abandoned'] as const;

export async function handleFeedbackRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  // POST /api/feedback/:generationId/outcome
  const outcomeMatch = url.match(/^\/api\/feedback\/([^/]+)\/outcome$/);
  if (outcomeMatch && req.method === 'POST') {
    const generationId = outcomeMatch[1]!;
    const body = await parseBody(req);
    const outcomeType = body.outcomeType as string | undefined;
    const userId = body.userId as string | undefined;

    if (!outcomeType || !userId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: outcomeType, userId' }));
      return;
    }

    if (!VALID_OUTCOME_TYPES.includes(outcomeType as typeof VALID_OUTCOME_TYPES[number])) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        error: `Invalid outcomeType. Must be one of: ${VALID_OUTCOME_TYPES.join(', ')}`,
      }));
      return;
    }

    // Verify the generation exists
    const [generation] = await db
      .select({ id: aiGenerations.id })
      .from(aiGenerations)
      .where(eq(aiGenerations.id, generationId))
      .limit(1);

    if (!generation) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Generation not found: ${generationId}` }));
      return;
    }

    const [created] = await db
      .insert(outcomes)
      .values({
        generationId,
        userId,
        outcomeType,
        outcomeValue: (body.outcomeValue as Record<string, unknown>) ?? null,
      })
      .returning();

    res.statusCode = 201;
    res.end(JSON.stringify(created));
    return;
  }

  // PATCH /api/feedback/:generationId
  const feedbackMatch = url.match(/^\/api\/feedback\/([^/]+)$/);
  if (feedbackMatch && req.method === 'PATCH') {
    const generationId = feedbackMatch[1]!;
    const body = await parseBody(req);

    const userFeedback = body.userFeedback as string | undefined;
    const thumbs = body.thumbs as number | undefined;
    const userEditDiff = body.userEditDiff as string | undefined;

    // Validate feedback value if provided
    if (userFeedback && !VALID_FEEDBACK.includes(userFeedback as typeof VALID_FEEDBACK[number])) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        error: `Invalid userFeedback. Must be one of: ${VALID_FEEDBACK.join(', ')}`,
      }));
      return;
    }

    // Validate thumbs value if provided
    if (thumbs !== undefined && !VALID_THUMBS.includes(thumbs as typeof VALID_THUMBS[number])) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'thumbs must be -1, 0, or 1' }));
      return;
    }

    // Must provide at least one feedback field
    if (!userFeedback && thumbs === undefined && !userEditDiff) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Provide at least one of: userFeedback, thumbs, userEditDiff' }));
      return;
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      feedbackAt: new Date(),
    };
    if (userFeedback) updates.userFeedback = userFeedback;
    if (thumbs !== undefined) updates.thumbs = thumbs;
    if (userEditDiff) updates.userEditDiff = userEditDiff;

    const [updated] = await db
      .update(aiGenerations)
      .set(updates)
      .where(eq(aiGenerations.id, generationId))
      .returning();

    if (!updated) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Generation not found: ${generationId}` }));
      return;
    }

    res.end(JSON.stringify(updated));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
