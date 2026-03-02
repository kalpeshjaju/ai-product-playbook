/**
 * FILE PURPOSE: Scheduled prompt promotion/rollback loop runner
 *
 * WHY: Strategy moat readiness requires automated, recurring prompt promotion
 *      decisions based on live outcomes instead of manual endpoint calls.
 *
 * HOW: For each configured prompt name, loads active candidate metrics from
 *      ai_generations/outcomes, applies promotion policy, mutates active_pct,
 *      and writes a JSON report artifact.
 *
 * USAGE:
 *   npx tsx scripts/run-prompt-promotion-loop.ts
 *   DRY_RUN=true npx tsx scripts/run-prompt-promotion-loop.ts
 *
 * AUTHOR: Codex (GPT-5)
 * LAST UPDATED: 2026-03-02
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db, aiGenerations, outcomes, promptVersions } from '../apps/api/src/db/index.js';
import {
  decidePromptAction,
  type PromotionThresholds,
} from '../apps/api/src/services/prompt-promotion-policy.js';

interface PromptLoopResult {
  promptName: string;
  candidateVersion: string | null;
  candidateActivePct: number | null;
  evalScore: number | null;
  samples: number;
  accepted: number;
  conversions: number;
  acceptanceRate: number;
  conversionRate: number;
  decision: 'hold' | 'promote' | 'rollback';
  reason: string;
  nextPct: number | null;
  actionApplied: string;
  error: string | null;
}

interface PromotionLoopReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  lookbackDays: number;
  thresholds: PromotionThresholds;
  prompts: PromptLoopResult[];
  failures: number;
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMaybeNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fallbackResult(promptName: string, reason: string): PromptLoopResult {
  return {
    promptName,
    candidateVersion: null,
    candidateActivePct: null,
    evalScore: null,
    samples: 0,
    accepted: 0,
    conversions: 0,
    acceptanceRate: 0,
    conversionRate: 0,
    decision: 'hold',
    reason,
    nextPct: null,
    actionApplied: 'none',
    error: null,
  };
}

async function run(): Promise<void> {
  const dryRun = process.env.DRY_RUN === 'true';
  const promptNames = parseCsvEnv(process.env.PROMOTION_PROMPT_NAMES);
  const lookbackDays = envNumber('PROMOTION_LOOKBACK_DAYS', 7);
  const reportPath = resolve(process.env.PROMOTION_REPORT_PATH?.trim() || 'prompt-promotion-report.json');

  if (promptNames.length === 0) {
    throw new Error('PROMOTION_PROMPT_NAMES is required (comma-separated prompt names).');
  }

  const thresholds: PromotionThresholds = {
    minSamples: envNumber('PROMOTION_MIN_SAMPLES', 20),
    promoteMinAcceptanceRate: envNumber('PROMOTION_MIN_ACCEPTANCE_RATE', 0.75),
    promoteMinConversionRate: envNumber('PROMOTION_MIN_CONVERSION_RATE', 0.08),
    rollbackMaxAcceptanceRate: envNumber('PROMOTION_ROLLBACK_MAX_ACCEPTANCE_RATE', 0.55),
    rollbackMaxConversionRate: envNumber('PROMOTION_ROLLBACK_MAX_CONVERSION_RATE', 0.02),
  };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const startedAt = new Date().toISOString();
  const results: PromptLoopResult[] = [];
  let failures = 0;

  for (const promptName of promptNames) {
    try {
      const versions = await db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptName, promptName))
        .orderBy(desc(promptVersions.activePct), desc(promptVersions.createdAt));

      if (versions.length === 0) {
        results.push(fallbackResult(promptName, 'no_prompt_versions'));
        continue;
      }

      const candidate = versions.find((version) => version.activePct > 0 && version.activePct < 100);
      if (!candidate) {
        results.push(fallbackResult(promptName, 'no_active_candidate'));
        continue;
      }

      const [metricsRow] = await db
        .select({
          samples: sql<number>`count(distinct ${aiGenerations.id})::int`,
          accepted: sql<number>`count(distinct case when ${aiGenerations.userFeedback} = 'accepted' then ${aiGenerations.id} end)::int`,
          conversions: sql<number>`count(distinct case when ${outcomes.outcomeType} = 'conversion' then ${aiGenerations.id} end)::int`,
        })
        .from(aiGenerations)
        .leftJoin(outcomes, eq(outcomes.generationId, aiGenerations.id))
        .where(and(
          eq(aiGenerations.promptVersion, candidate.version),
          eq(aiGenerations.promptHash, candidate.contentHash),
          gte(aiGenerations.createdAt, cutoff),
        ));

      const samples = Number(metricsRow?.samples ?? 0);
      const accepted = Number(metricsRow?.accepted ?? 0);
      const conversions = Number(metricsRow?.conversions ?? 0);
      const evalScore = parseMaybeNumber(candidate.evalScore);

      const decision = decidePromptAction(
        { samples, accepted, conversions },
        { activePct: candidate.activePct, evalScore },
        thresholds,
      );

      let actionApplied = 'none';
      if (!dryRun) {
        if (decision.action === 'promote' && decision.nextPct !== null) {
          if (decision.nextPct === 100) {
            await db
              .update(promptVersions)
              .set({ activePct: 0 })
              .where(eq(promptVersions.promptName, promptName));
          }

          await db
            .update(promptVersions)
            .set({ activePct: decision.nextPct })
            .where(eq(promptVersions.id, candidate.id));

          actionApplied = `set_active_pct:${decision.nextPct}`;
        } else if (decision.action === 'rollback') {
          await db
            .update(promptVersions)
            .set({ activePct: 0 })
            .where(eq(promptVersions.id, candidate.id));

          actionApplied = 'set_active_pct:0';
        }
      }

      results.push({
        promptName,
        candidateVersion: candidate.version,
        candidateActivePct: candidate.activePct,
        evalScore,
        samples,
        accepted,
        conversions,
        acceptanceRate: decision.acceptanceRate,
        conversionRate: decision.conversionRate,
        decision: decision.action,
        reason: decision.reason,
        nextPct: decision.nextPct,
        actionApplied,
        error: null,
      });
    } catch (error: unknown) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        ...fallbackResult(promptName, 'execution_error'),
        error: message,
      });
    }
  }

  const report: PromotionLoopReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    lookbackDays,
    thresholds,
    prompts: results,
    failures,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  process.stdout.write(`Prompt promotion report written: ${reportPath}\n`);
  process.stdout.write(`prompts=${results.length}, failures=${failures}\n`);

  if (failures > 0) {
    throw new Error(`Prompt promotion loop failed for ${failures} prompt(s).`);
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
});
