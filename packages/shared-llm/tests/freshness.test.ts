import { describe, it, expect } from 'vitest';
import { computeFreshnessMultiplier } from '../src/ingestion/freshness.js';

describe('computeFreshnessMultiplier', () => {
  it('returns 1.0 for docs less than 30 days old', () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    expect(computeFreshnessMultiplier(recent)).toBe(1.0);
  });

  it('returns 0.9 for docs 30-90 days old', () => {
    const medium = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    expect(computeFreshnessMultiplier(medium)).toBe(0.9);
  });

  it('returns 0.8 for docs older than 90 days', () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000); // 120 days ago
    expect(computeFreshnessMultiplier(old)).toBe(0.8);
  });

  it('returns 1.0 for null date', () => {
    expect(computeFreshnessMultiplier(null)).toBe(1.0);
  });
});
