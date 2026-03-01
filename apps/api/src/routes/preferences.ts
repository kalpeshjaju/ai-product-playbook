/**
 * FILE PURPOSE: User preference CRUD + inference trigger
 *
 * WHY: STRATEGY pillar §20 — preferences drive personalized model routing
 *      and prompt customization. Supports explicit user-set preferences
 *      and feedback-inferred preferences.
 *
 * HOW: CRUD on user_preferences table. Inference endpoint queries feedback
 *      history and applies rule-based pattern matching via shared-llm.
 *
 * Routes:
 *   GET    /api/preferences/:userId         — get all preferences
 *   POST   /api/preferences/:userId         — set an explicit preference
 *   PATCH  /api/preferences/:userId/:key    — update a preference value
 *   DELETE /api/preferences/:userId/:key    — delete a preference
 *   POST   /api/preferences/:userId/infer   — trigger inference from feedback
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, and, isNotNull, desc } from 'drizzle-orm';
import { db, userPreferences, aiGenerations } from '../db/index.js';
import { inferPreferences } from '@playbook/shared-llm';
import type { FeedbackSignal } from '@playbook/shared-llm';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

export async function handlePreferenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  const parsedUrl = new URL(url, 'http://localhost');

  // POST /api/preferences/:userId/infer
  const inferMatch = parsedUrl.pathname.match(/^\/api\/preferences\/([^/]+)\/infer$/);
  if (inferMatch && req.method === 'POST') {
    const userId = decodeURIComponent(inferMatch[1]!);

    // Query last 100 generations with feedback
    const rows = await db
      .select()
      .from(aiGenerations)
      .where(and(
        eq(aiGenerations.userId, userId),
        isNotNull(aiGenerations.userFeedback),
      ))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(100);

    const signals: FeedbackSignal[] = rows.map((r) => ({
      userFeedback: r.userFeedback ?? 'ignored',
      thumbs: r.thumbs,
      model: r.model,
      taskType: r.taskType,
      latencyMs: r.latencyMs,
      qualityScore: r.qualityScore ? parseFloat(r.qualityScore) : null,
      userEditDiff: r.userEditDiff,
    }));

    const inferred = inferPreferences(signals);

    // Upsert inferred preferences (never overwrite explicit ones)
    for (const pref of inferred) {
      const [existing] = await db
        .select()
        .from(userPreferences)
        .where(and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.preferenceKey, pref.preferenceKey),
        ))
        .limit(1);

      if (existing && existing.source === 'explicit') continue; // explicit wins

      if (existing) {
        await db
          .update(userPreferences)
          .set({
            preferenceValue: pref.preferenceValue,
            confidence: pref.confidence.toFixed(2),
            source: 'inferred',
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.id, existing.id));
      } else {
        await db.insert(userPreferences).values({
          userId,
          preferenceKey: pref.preferenceKey,
          preferenceValue: pref.preferenceValue,
          source: 'inferred',
          confidence: pref.confidence.toFixed(2),
        });
      }
    }

    res.end(JSON.stringify({ inferred: inferred.length, preferences: inferred }));
    return;
  }

  // DELETE /api/preferences/:userId/:key
  const deleteMatch = parsedUrl.pathname.match(/^\/api\/preferences\/([^/]+)\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const userId = decodeURIComponent(deleteMatch[1]!);
    const key = decodeURIComponent(deleteMatch[2]!);

    const [deleted] = await db
      .delete(userPreferences)
      .where(and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.preferenceKey, key),
      ))
      .returning();

    if (!deleted) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Preference not found: ${key}` }));
      return;
    }

    res.end(JSON.stringify({ deleted: key }));
    return;
  }

  // PATCH /api/preferences/:userId/:key
  const patchMatch = parsedUrl.pathname.match(/^\/api\/preferences\/([^/]+)\/([^/]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const userId = decodeURIComponent(patchMatch[1]!);
    const key = decodeURIComponent(patchMatch[2]!);
    const body = await parseBody(req);

    if (body.preferenceValue === undefined) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: preferenceValue' }));
      return;
    }

    const [updated] = await db
      .update(userPreferences)
      .set({
        preferenceValue: body.preferenceValue,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.preferenceKey, key),
      ))
      .returning();

    if (!updated) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `Preference not found: ${key}` }));
      return;
    }

    res.end(JSON.stringify(updated));
    return;
  }

  // GET /api/preferences/:userId
  const getMatch = parsedUrl.pathname.match(/^\/api\/preferences\/([^/]+)$/);
  if (getMatch && req.method === 'GET') {
    const userId = decodeURIComponent(getMatch[1]!);
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    res.end(JSON.stringify(rows));
    return;
  }

  // POST /api/preferences/:userId
  const postMatch = parsedUrl.pathname.match(/^\/api\/preferences\/([^/]+)$/);
  if (postMatch && req.method === 'POST') {
    const userId = decodeURIComponent(postMatch[1]!);
    const body = await parseBody(req);
    const preferenceKey = body.preferenceKey as string | undefined;
    const preferenceValue = body.preferenceValue;

    if (!preferenceKey || preferenceValue === undefined) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: preferenceKey, preferenceValue' }));
      return;
    }

    // Upsert: insert or update if key already exists
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.preferenceKey, preferenceKey),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userPreferences)
        .set({
          preferenceValue,
          source: 'explicit',
          confidence: '1.00',
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.id, existing.id))
        .returning();

      res.end(JSON.stringify(updated));
      return;
    }

    const [created] = await db
      .insert(userPreferences)
      .values({
        userId,
        preferenceKey,
        preferenceValue,
        source: 'explicit',
        confidence: '1.00',
      })
      .returning();

    res.statusCode = 201;
    res.end(JSON.stringify(created));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
