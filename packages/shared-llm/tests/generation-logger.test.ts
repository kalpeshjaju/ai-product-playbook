/**
 * Tests for createGenerationLog — SHA-256 hashing, cost formatting, optional defaults.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createGenerationLog } from '../src/generation-logger.js';
import type { GenerationLogInput } from '../src/generation-logger.js';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function makeInput(overrides?: Partial<GenerationLogInput>): GenerationLogInput {
  return {
    userId: 'user-1',
    promptText: 'Hello world',
    promptVersion: 'v1.0',
    taskType: 'chat',
    inputTokens: 10,
    responseText: 'Hi there',
    outputTokens: 5,
    model: 'claude-haiku',
    modelVersion: '3.5',
    latencyMs: 200,
    costUsd: 0.001234,
    ...overrides,
  };
}

describe('createGenerationLog', () => {
  it('hashes promptText with SHA-256', () => {
    const result = createGenerationLog(makeInput());
    expect(result.promptHash).toBe(sha256('Hello world'));
    expect(result.promptHash).toHaveLength(64);
  });

  it('hashes responseText with SHA-256', () => {
    const result = createGenerationLog(makeInput());
    expect(result.responseHash).toBe(sha256('Hi there'));
    expect(result.responseHash).toHaveLength(64);
  });

  it('produces deterministic hashes', () => {
    const a = createGenerationLog(makeInput());
    const b = createGenerationLog(makeInput());
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.responseHash).toBe(b.responseHash);
  });

  it('different text produces different hashes', () => {
    const a = createGenerationLog(makeInput({ promptText: 'aaa' }));
    const b = createGenerationLog(makeInput({ promptText: 'bbb' }));
    expect(a.promptHash).not.toBe(b.promptHash);
  });

  it('formats costUsd with 6 decimal places', () => {
    const result = createGenerationLog(makeInput({ costUsd: 0.001234 }));
    expect(result.costUsd).toBe('0.001234');
  });

  it('pads costUsd to 6 decimals', () => {
    const result = createGenerationLog(makeInput({ costUsd: 1 }));
    expect(result.costUsd).toBe('1.000000');
  });

  it('formats qualityScore with 2 decimal places when provided', () => {
    const result = createGenerationLog(makeInput({ qualityScore: 0.9 }));
    expect(result.qualityScore).toBe('0.90');
  });

  it('returns null qualityScore when not provided', () => {
    const result = createGenerationLog(makeInput());
    expect(result.qualityScore).toBeNull();
  });

  it('defaults hallucination to false', () => {
    const result = createGenerationLog(makeInput());
    expect(result.hallucination).toBe(false);
  });

  it('passes through hallucination=true', () => {
    const result = createGenerationLog(makeInput({ hallucination: true }));
    expect(result.hallucination).toBe(true);
  });

  it('defaults guardrailTriggered to null', () => {
    const result = createGenerationLog(makeInput());
    expect(result.guardrailTriggered).toBeNull();
  });

  it('passes through guardrailTriggered array', () => {
    const result = createGenerationLog(makeInput({
      guardrailTriggered: ['pii', 'toxicity'],
    }));
    expect(result.guardrailTriggered).toEqual(['pii', 'toxicity']);
  });

  it('defaults sessionId to null', () => {
    const result = createGenerationLog(makeInput());
    expect(result.sessionId).toBeNull();
  });

  it('passes through sessionId when provided', () => {
    const result = createGenerationLog(makeInput({ sessionId: 'sess-1' }));
    expect(result.sessionId).toBe('sess-1');
  });

  it('passes through scalar fields unchanged', () => {
    const result = createGenerationLog(makeInput());
    expect(result.userId).toBe('user-1');
    expect(result.promptVersion).toBe('v1.0');
    expect(result.taskType).toBe('chat');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.model).toBe('claude-haiku');
    expect(result.modelVersion).toBe('3.5');
    expect(result.latencyMs).toBe(200);
  });
});
