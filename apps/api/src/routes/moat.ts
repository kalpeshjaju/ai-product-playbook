/**
 * FILE PURPOSE: Moat health dashboard API route
 *
 * WHY: Playbook §22 prescribes a moat health dashboard to visualize
 *      flywheel velocity, quality metrics, few-shot coverage,
 *      outcome funnel, and prompt health — all from existing tables.
 *
 * HOW: GET /api/moat-health returns aggregated metrics from
 *      ai_generations, outcomes, few_shot_bank, and prompt_versions.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-02
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sql, eq, gt } from 'drizzle-orm';
import { db, aiGenerations, outcomes, fewShotBank, promptVersions } from '../db/index.js';

export async function handleMoatRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<void> {
  try {
    const parsedUrl = new URL(url, 'http://localhost');

    if (parsedUrl.pathname !== '/api/moat-health' || req.method !== 'GET') {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // ── 1. Flywheel velocity ──────────────────────────────────────────────
    const [velocity] = await db
      .select({
        total: sql<number>`count(*)::int`,
        perDay: sql<number>`coalesce(
          count(*)::float / nullif(extract(epoch from (max(${aiGenerations.createdAt}) - min(${aiGenerations.createdAt}))) / 86400, 0),
          0
        )`,
        feedbackRate: sql<number>`coalesce(
          (count(${aiGenerations.userFeedback})::float / nullif(count(*)::float, 0)) * 100,
          0
        )`,
      })
      .from(aiGenerations);

    // ── 2. Quality metrics ────────────────────────────────────────────────
    const [quality] = await db
      .select({
        avgQuality: sql<string | null>`avg(${aiGenerations.qualityScore})`,
        hallucinationRate: sql<number>`coalesce(
          (sum(case when ${aiGenerations.hallucination} = true then 1 else 0 end)::float
           / nullif(count(*)::float, 0)) * 100,
          0
        )`,
        thumbsUp: sql<number>`count(case when ${aiGenerations.thumbs} = 1 then 1 end)::int`,
        thumbsDown: sql<number>`count(case when ${aiGenerations.thumbs} = -1 then 1 end)::int`,
      })
      .from(aiGenerations);

    // ── 3. Few-shot coverage ──────────────────────────────────────────────
    const fewShotRows = await db
      .select({
        taskType: fewShotBank.taskType,
        active: sql<number>`count(*)::int`,
        auto: sql<number>`count(case when ${fewShotBank.curatedBy} = 'auto' then 1 end)::int`,
        manual: sql<number>`count(case when ${fewShotBank.curatedBy} = 'manual' then 1 end)::int`,
      })
      .from(fewShotBank)
      .where(eq(fewShotBank.isActive, true))
      .groupBy(fewShotBank.taskType);

    // ── 4. Outcome funnel ─────────────────────────────────────────────────
    const [funnel] = await db
      .select({
        totalGenerations: sql<number>`(select count(*)::int from ai_generations)`,
        withFeedback: sql<number>`(select count(*)::int from ai_generations where user_feedback is not null)`,
        conversions: sql<number>`count(case when ${outcomes.outcomeType} = 'conversion' then 1 end)::int`,
        abandoned: sql<number>`count(case when ${outcomes.outcomeType} = 'abandoned' then 1 end)::int`,
      })
      .from(outcomes);

    // ── 5. Prompt health ──────────────────────────────────────────────────
    const activePrompts = await db
      .select({
        promptName: promptVersions.promptName,
        version: promptVersions.version,
        evalScore: promptVersions.evalScore,
        activePct: promptVersions.activePct,
      })
      .from(promptVersions)
      .where(gt(promptVersions.activePct, 0));

    res.end(JSON.stringify({
      flywheelVelocity: {
        generationsPerDay: Math.round((velocity?.perDay ?? 0) * 100) / 100,
        totalGenerations: velocity?.total ?? 0,
        feedbackRatePct: Math.round((velocity?.feedbackRate ?? 0) * 100) / 100,
      },
      quality: {
        avgQualityScore: quality?.avgQuality ? parseFloat(quality.avgQuality) : null,
        hallucinationRatePct: Math.round((quality?.hallucinationRate ?? 0) * 100) / 100,
        thumbsUp: quality?.thumbsUp ?? 0,
        thumbsDown: quality?.thumbsDown ?? 0,
      },
      fewShotCoverage: fewShotRows,
      outcomeFunnel: {
        totalGenerations: funnel?.totalGenerations ?? 0,
        withFeedback: funnel?.withFeedback ?? 0,
        conversions: funnel?.conversions ?? 0,
        abandoned: funnel?.abandoned ?? 0,
      },
      promptHealth: activePrompts,
    }));
  } catch (err) {
    process.stderr.write(`ERROR in moat routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
