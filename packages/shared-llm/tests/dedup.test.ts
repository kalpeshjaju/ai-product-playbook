import { describe, it, expect } from 'vitest';
import { isHashDuplicate, cosineSimilarity } from '../src/ingestion/dedup/index.js';

describe('isHashDuplicate', () => {
  it('returns true for matching hashes', () => {
    const hashes = new Set(['abc123', 'def456']);
    expect(isHashDuplicate('abc123', hashes)).toBe(true);
  });

  it('returns false for non-matching hashes', () => {
    const hashes = new Set(['abc123']);
    expect(isHashDuplicate('xyz789', hashes)).toBe(false);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns ~1.0 for near-identical vectors', () => {
    const a = [0.9, 0.1, 0.05];
    const b = [0.91, 0.09, 0.04];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
  });

  it('returns 0 for mismatched-dimension vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});
