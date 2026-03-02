/**
 * FILE PURPOSE: Prompt promotion/rollback decision policy
 *
 * WHY: Strategy moat automation needs deterministic, testable decisions for
 *      when to promote, rollback, or hold prompt versions based on live data.
 *
 * HOW: Computes acceptance/conversion rates from metrics and applies
 *      configurable thresholds plus the promotion ladder quality gate.
 *
 * AUTHOR: Codex (GPT-5)
 * LAST UPDATED: 2026-03-02
 */

export interface PromotionThresholds {
  minSamples: number;
  promoteMinAcceptanceRate: number;
  promoteMinConversionRate: number;
  rollbackMaxAcceptanceRate: number;
  rollbackMaxConversionRate: number;
}

export interface PromptMetrics {
  samples: number;
  accepted: number;
  conversions: number;
}

export interface PromptCandidateState {
  activePct: number;
  evalScore: number | null;
}

export type PromptAction = 'hold' | 'promote' | 'rollback';

export interface PromptDecision {
  action: PromptAction;
  reason: string;
  acceptanceRate: number;
  conversionRate: number;
  nextPct: number | null;
}

const PROMOTION_LADDER = [0, 10, 50, 100] as const;

function safeRate(part: number, total: number): number {
  if (total <= 0) return 0;
  return part / total;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Return the next ladder step above the current active percentage. */
export function nextPromotionStep(activePct: number): number | null {
  for (const step of PROMOTION_LADDER) {
    if (step > activePct) return step;
  }
  return null;
}

/** Decide whether to promote, rollback, or hold a prompt version. */
export function decidePromptAction(
  metrics: PromptMetrics,
  candidate: PromptCandidateState,
  thresholds: PromotionThresholds,
): PromptDecision {
  const acceptanceRate = round4(safeRate(metrics.accepted, metrics.samples));
  const conversionRate = round4(safeRate(metrics.conversions, metrics.samples));

  if (metrics.samples < thresholds.minSamples) {
    return {
      action: 'hold',
      reason: 'insufficient_samples',
      acceptanceRate,
      conversionRate,
      nextPct: null,
    };
  }

  const rollbackTriggered = (
    acceptanceRate < thresholds.rollbackMaxAcceptanceRate
    || conversionRate < thresholds.rollbackMaxConversionRate
  );

  if (rollbackTriggered && candidate.activePct > 0) {
    return {
      action: 'rollback',
      reason: 'below_rollback_threshold',
      acceptanceRate,
      conversionRate,
      nextPct: 0,
    };
  }

  const nextPct = nextPromotionStep(candidate.activePct);
  if (nextPct === null) {
    return {
      action: 'hold',
      reason: 'already_fully_promoted',
      acceptanceRate,
      conversionRate,
      nextPct: null,
    };
  }

  const passesPromotionThresholds = (
    acceptanceRate >= thresholds.promoteMinAcceptanceRate
    && conversionRate >= thresholds.promoteMinConversionRate
  );

  if (!passesPromotionThresholds) {
    return {
      action: 'hold',
      reason: 'below_promotion_threshold',
      acceptanceRate,
      conversionRate,
      nextPct: null,
    };
  }

  if (nextPct > 10 && (candidate.evalScore === null || candidate.evalScore < 0.70)) {
    return {
      action: 'hold',
      reason: 'quality_gate_failed',
      acceptanceRate,
      conversionRate,
      nextPct: null,
    };
  }

  return {
    action: 'promote',
    reason: 'meets_promotion_threshold',
    acceptanceRate,
    conversionRate,
    nextPct,
  };
}
