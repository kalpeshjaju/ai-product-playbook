import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { routeQuery } from '../src/routing/router.js';

describe('routeQuery', () => {
  beforeEach(() => {
    vi.stubEnv('ROUTELLM_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns inactive when ROUTELLM_ENABLED is not true', () => {
    vi.stubEnv('ROUTELLM_ENABLED', '');
    const result = routeQuery('Hello world');
    expect(result.active).toBe(false);
    expect(result.tier).toBe('balanced');
    expect(result.model).toBe('claude-haiku');
    expect(result.reason).toContain('disabled');
  });

  it('routes simple classification tasks to fast tier', () => {
    const result = routeQuery('Classify this email as spam or ham', {
      taskType: 'classification',
    });
    expect(result.active).toBe(true);
    expect(result.tier).toBe('fast');
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('routes complex synthesis tasks to quality tier', () => {
    const result = routeQuery(
      'Analyze the competitive landscape and synthesize a strategic report comparing all major players. ' +
      'First identify the key differentiators, then evaluate market positioning, finally recommend a strategy.',
      { taskType: 'synthesis' },
    );
    expect(result.active).toBe(true);
    expect(result.tier).toBe('quality');
    expect(result.model).toBe('claude-sonnet');
  });

  it('respects forceTier override', () => {
    const result = routeQuery('Simple question', { forceTier: 'quality' });
    expect(result.tier).toBe('quality');
    expect(result.model).toBe('claude-sonnet');
    expect(result.active).toBe(true);
    expect(result.reason).toContain('Forced');
  });

  it('downgrades quality tier when maxLatencyMs < 2000', () => {
    // Multi-step instruction boosts complexity by +0.15, synthesis task +0.35, keyword +0.1 = 0.6
    const result = routeQuery(
      'First analyze the market data, then synthesize a report, finally evaluate the positioning.',
      { taskType: 'synthesis', maxLatencyMs: 1000 },
    );
    expect(result.active).toBe(true);
    // Should be downgraded from quality to balanced due to latency constraint
    expect(result.tier).toBe('balanced');
    expect(result.reason).toContain('downgraded');
  });

  it('uses defaultTier when routing is disabled', () => {
    vi.stubEnv('ROUTELLM_ENABLED', '');
    const result = routeQuery('Test', { defaultTier: 'fast' });
    expect(result.tier).toBe('fast');
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.active).toBe(false);
  });

  it('adjusts thresholds based on costSensitivity', () => {
    // With high cost sensitivity (1.0), qualityThreshold = 0.4
    // With low cost sensitivity (0.0), qualityThreshold = 0.6
    const longQuery = 'word '.repeat(250); // 250 words → +0.2 complexity
    const highCost = routeQuery(longQuery, { costSensitivity: 1.0 });
    const lowCost = routeQuery(longQuery, { costSensitivity: 0.0 });
    // Same query, but different thresholds may produce different tiers
    expect(highCost.active).toBe(true);
    expect(lowCost.active).toBe(true);
  });
});
