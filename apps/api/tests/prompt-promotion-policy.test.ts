/**
 * Tests for strategy prompt promotion policy.
 */

import { describe, expect, it } from 'vitest';
import {
  decidePromptAction,
  nextPromotionStep,
  type PromotionThresholds,
} from '../src/services/prompt-promotion-policy.js';

const thresholds: PromotionThresholds = {
  minSamples: 20,
  promoteMinAcceptanceRate: 0.75,
  promoteMinConversionRate: 0.08,
  rollbackMaxAcceptanceRate: 0.55,
  rollbackMaxConversionRate: 0.02,
};

describe('nextPromotionStep', () => {
  it('returns next ladder step for standard values', () => {
    expect(nextPromotionStep(0)).toBe(10);
    expect(nextPromotionStep(10)).toBe(50);
    expect(nextPromotionStep(50)).toBe(100);
    expect(nextPromotionStep(100)).toBeNull();
  });

  it('returns the next higher ladder step for non-standard percentages', () => {
    expect(nextPromotionStep(15)).toBe(50);
    expect(nextPromotionStep(99)).toBe(100);
  });
});

describe('decidePromptAction', () => {
  it('holds when there are not enough samples', () => {
    const decision = decidePromptAction(
      { samples: 10, accepted: 8, conversions: 2 },
      { activePct: 10, evalScore: 0.9 },
      thresholds,
    );
    expect(decision.action).toBe('hold');
    expect(decision.reason).toBe('insufficient_samples');
  });

  it('rolls back when metrics fall below rollback thresholds', () => {
    const decision = decidePromptAction(
      { samples: 30, accepted: 10, conversions: 0 },
      { activePct: 10, evalScore: 0.9 },
      thresholds,
    );
    expect(decision.action).toBe('rollback');
    expect(decision.reason).toBe('below_rollback_threshold');
    expect(decision.nextPct).toBe(0);
  });

  it('promotes when metrics and eval gate pass', () => {
    const decision = decidePromptAction(
      { samples: 30, accepted: 24, conversions: 4 },
      { activePct: 10, evalScore: 0.81 },
      thresholds,
    );
    expect(decision.action).toBe('promote');
    expect(decision.nextPct).toBe(50);
  });

  it('holds when eval gate fails beyond 10%', () => {
    const decision = decidePromptAction(
      { samples: 30, accepted: 24, conversions: 4 },
      { activePct: 10, evalScore: 0.5 },
      thresholds,
    );
    expect(decision.action).toBe('hold');
    expect(decision.reason).toBe('quality_gate_failed');
  });

  it('holds when already fully promoted', () => {
    const decision = decidePromptAction(
      { samples: 30, accepted: 28, conversions: 7 },
      { activePct: 100, evalScore: 0.95 },
      thresholds,
    );
    expect(decision.action).toBe('hold');
    expect(decision.reason).toBe('already_fully_promoted');
  });
});
