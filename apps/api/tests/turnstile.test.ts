/**
 * Tests for Turnstile bot verification middleware (middleware/turnstile.ts)
 *
 * Verifies fail-open in dev, fail-closed in prod when key or token missing or fetch fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;
const originalFetch = globalThis.fetch;

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('returns true in development (fail-open)', async () => {
    process.env.NODE_ENV = 'development';
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('', '127.0.0.1');
    expect(result).toBe(true);
  });

  it('returns true when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'test';
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('', '127.0.0.1');
    expect(result).toBe(true);
  });

  it('returns false in production when TURNSTILE_SECRET_KEY is not set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('some-token', '127.0.0.1');
    expect(result).toBe(false);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('TURNSTILE_SECRET_KEY'),
    );
    stderrSpy.mockRestore();
  });

  it('returns false in production when token is empty', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('', '127.0.0.1');
    expect(result).toBe(false);
  });

  it('returns true in production when fetch returns success', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('valid-token', '10.0.0.1');
    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      }),
    );
  });

  it('returns false in production when fetch returns success: false', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    });
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('bad-token', '10.0.0.1');
    expect(result).toBe(false);
  });

  it('returns false in production when fetch throws (network failure)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { verifyTurnstileToken } = await import('../src/middleware/turnstile.js');
    const result = await verifyTurnstileToken('token', '10.0.0.1');
    expect(result).toBe(false);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Turnstile verification failed'),
    );
    stderrSpy.mockRestore();
  });
});
