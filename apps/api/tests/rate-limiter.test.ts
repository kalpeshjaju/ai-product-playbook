/**
 * Tests for token-based rate limiter (rate-limiter.ts)
 *
 * Mocks ioredis to test budget check allowed, exceeded, and fail-open.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis before importing the module
vi.mock('ioredis', () => {
  const pipeline = {
    incrby: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  const mockRedis = {
    get: vi.fn().mockResolvedValue(null),
    on: vi.fn().mockReturnThis(),
    pipeline: vi.fn(() => pipeline),
  };
  return {
    Redis: vi.fn(() => mockRedis),
    __mockRedis: mockRedis,
    __pipeline: pipeline,
  };
});

describe('checkTokenBudget', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows requests when Redis is not configured (fail-open)', async () => {
    vi.stubEnv('REDIS_URL', '');
    const { checkTokenBudget } = await import('../src/rate-limiter.js');
    const result = await checkTokenBudget('user-1', 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(100_000);
    expect(result.limit).toBe(100_000);
    vi.unstubAllEnvs();
  });

  it('allows requests within budget when Redis is configured', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const { checkTokenBudget } = await import('../src/rate-limiter.js');
    // Mock Redis .get() returns null (no previous usage)
    const result = await checkTokenBudget('user-1', 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99_500);
    vi.unstubAllEnvs();
  });

  it('rejects requests when budget is exceeded', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const { checkTokenBudget } = await import('../src/rate-limiter.js');
    // Override mock: user already used 99,800 tokens
    const { __mockRedis } = await import('ioredis') as unknown as { __mockRedis: { get: ReturnType<typeof vi.fn> } };
    __mockRedis.get.mockResolvedValueOnce('99800');
    const result = await checkTokenBudget('user-2', 500);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(200);
    vi.unstubAllEnvs();
  });

  it('fails open when Redis throws an error in dev mode', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const { checkTokenBudget } = await import('../src/rate-limiter.js');
    const { __mockRedis } = await import('ioredis') as unknown as { __mockRedis: { get: ReturnType<typeof vi.fn> } };
    __mockRedis.get.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await checkTokenBudget('user-3', 500);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100_000);
    vi.unstubAllEnvs();
  });

  // ── Production fail-closed behavior ──────────────────────────────────────

  it('blocks requests when Redis unavailable in production (fail-closed)', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { checkTokenBudget } = await import('../src/rate-limiter.js');
    const result = await checkTokenBudget('user-prod', 500);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(100_000);
    vi.unstubAllEnvs();
  });

  it('blocks requests when Redis throws error in production (fail-closed)', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('NODE_ENV', 'production');
    const { checkTokenBudget } = await import('../src/rate-limiter.js');
    const { __mockRedis } = await import('ioredis') as unknown as { __mockRedis: { get: ReturnType<typeof vi.fn> } };
    __mockRedis.get.mockRejectedValueOnce(new Error('Redis crashed'));
    const result = await checkTokenBudget('user-prod-err', 500);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(100_000);
    vi.unstubAllEnvs();
  });
});
