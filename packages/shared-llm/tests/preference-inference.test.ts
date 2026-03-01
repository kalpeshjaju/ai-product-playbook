/**
 * Tests for preference inference (preferences/inference.ts)
 *
 * Pure logic tests — no mocking needed. Tests all four inference rules
 * plus edge cases.
 */

import { describe, it, expect } from 'vitest';
import { inferPreferences } from '../src/preferences/inference.js';
import type { FeedbackSignal } from '../src/preferences/inference.js';

/** Helper: create a feedback signal with defaults. */
function signal(overrides: Partial<FeedbackSignal> = {}): FeedbackSignal {
  return {
    userFeedback: 'accepted',
    thumbs: 1,
    model: 'claude-sonnet',
    taskType: 'summarize',
    latencyMs: 1500,
    qualityScore: 0.9,
    userEditDiff: null,
    ...overrides,
  };
}

describe('inferPreferences', () => {
  it('returns empty array when signals below minimum evidence count', () => {
    const signals = [signal(), signal(), signal()];
    expect(inferPreferences(signals)).toEqual([]);
  });

  it('returns empty array for empty signals', () => {
    expect(inferPreferences([])).toEqual([]);
  });

  it('returns empty array for single signal', () => {
    expect(inferPreferences([signal()])).toEqual([]);
  });

  // Rule 1: Model preference — >60% accepted from model X
  it('infers preferred_model when >60% accepted from one model', () => {
    const signals = [
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'gpt-4o', userFeedback: 'accepted' }),
    ];

    const prefs = inferPreferences(signals);
    const modelPref = prefs.find((p) => p.preferenceKey === 'preferred_model');
    expect(modelPref).toBeDefined();
    expect(modelPref!.preferenceValue).toBe('claude-sonnet');
    expect(modelPref!.confidence).toBe(0.7);
    expect(modelPref!.source).toBe('inferred');
  });

  it('does not infer model preference when no clear winner', () => {
    const signals = [
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'gpt-4o', userFeedback: 'accepted' }),
      signal({ model: 'gpt-4o', userFeedback: 'accepted' }),
      signal({ model: 'gpt-4o-mini', userFeedback: 'accepted' }),
    ];

    const prefs = inferPreferences(signals);
    const modelPref = prefs.find((p) => p.preferenceKey === 'preferred_model');
    expect(modelPref).toBeUndefined();
  });

  // Rule 2: Length preference — >50% edits shorten output
  it('infers preferred_length=concise when >50% edits shorten', () => {
    const signals = [
      signal({ userFeedback: 'edited', userEditDiff: '-removed line\n-another removed' }),
      signal({ userFeedback: 'edited', userEditDiff: '-deleted\n-more' }),
      signal({ userFeedback: 'edited', userEditDiff: '-cut this\n-and this' }),
      signal({ userFeedback: 'edited', userEditDiff: '+added line' }),
      signal({ userFeedback: 'edited', userEditDiff: '-shortened' }),
    ];

    const prefs = inferPreferences(signals);
    const lengthPref = prefs.find((p) => p.preferenceKey === 'preferred_length');
    expect(lengthPref).toBeDefined();
    expect(lengthPref!.preferenceValue).toBe('concise');
  });

  // Rule 3: Speed preference — >40% regenerated with high latency
  it('infers preferred_speed=fast when many regenerations with high latency', () => {
    const signals: FeedbackSignal[] = [];
    // 5 regenerated with high latency
    for (let i = 0; i < 5; i++) {
      signals.push(signal({ userFeedback: 'regenerated', latencyMs: 5000 }));
    }
    // 5 accepted (so regenerated = 50% > 40% threshold)
    for (let i = 0; i < 5; i++) {
      signals.push(signal({ userFeedback: 'accepted', latencyMs: 1000 }));
    }

    const prefs = inferPreferences(signals);
    const speedPref = prefs.find((p) => p.preferenceKey === 'preferred_speed');
    expect(speedPref).toBeDefined();
    expect(speedPref!.preferenceValue).toBe('fast');
  });

  it('does not infer speed preference when latency is low', () => {
    const signals: FeedbackSignal[] = [];
    for (let i = 0; i < 5; i++) {
      signals.push(signal({ userFeedback: 'regenerated', latencyMs: 500 }));
    }
    for (let i = 0; i < 5; i++) {
      signals.push(signal({ userFeedback: 'accepted' }));
    }

    const prefs = inferPreferences(signals);
    const speedPref = prefs.find((p) => p.preferenceKey === 'preferred_speed');
    expect(speedPref).toBeUndefined();
  });

  // Rule 4: Quality preference from thumbs per task type
  it('infers quality preference when avg thumbs > 0.5 for task type', () => {
    const signals = [
      signal({ taskType: 'code-review', thumbs: 1 }),
      signal({ taskType: 'code-review', thumbs: 1 }),
      signal({ taskType: 'code-review', thumbs: 1 }),
      signal({ taskType: 'code-review', thumbs: 0 }),
      signal({ taskType: 'code-review', thumbs: 1 }),
    ];

    const prefs = inferPreferences(signals);
    const qualPref = prefs.find((p) => p.preferenceKey === 'preferred_quality_code-review');
    expect(qualPref).toBeDefined();
    expect(qualPref!.preferenceValue).toBe('high');
  });

  it('respects custom minEvidenceCount', () => {
    const signals = [signal(), signal(), signal()];
    // Default minEvidenceCount=5 → empty
    expect(inferPreferences(signals)).toEqual([]);
    // Custom minEvidenceCount=3 → should process
    const prefs = inferPreferences(signals, 3);
    expect(Array.isArray(prefs)).toBe(true);
  });

  it('handles mixed feedback types producing multiple preferences', () => {
    const signals: FeedbackSignal[] = [
      // 4 accepted from same model (80% of accepted)
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'claude-sonnet', userFeedback: 'accepted' }),
      signal({ model: 'gpt-4o', userFeedback: 'accepted' }),
      // 5 edits that shorten
      signal({ userFeedback: 'edited', userEditDiff: '-line1\n-line2' }),
      signal({ userFeedback: 'edited', userEditDiff: '-removed' }),
      signal({ userFeedback: 'edited', userEditDiff: '-cut' }),
      signal({ userFeedback: 'edited', userEditDiff: '-trim' }),
      signal({ userFeedback: 'edited', userEditDiff: '+added' }),
    ];

    const prefs = inferPreferences(signals);
    const keys = prefs.map((p) => p.preferenceKey);
    expect(keys).toContain('preferred_model');
    expect(keys).toContain('preferred_length');
  });
});
