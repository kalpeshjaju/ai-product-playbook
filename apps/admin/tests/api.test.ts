/**
 * FILE PURPOSE: Tests for admin API utility (getApiHeaders, API_URL)
 * WHY: Codex audit flagged getApiHeaders as untested.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('getApiHeaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('includes x-api-key header when API_INTERNAL_KEY is set', async () => {
    vi.stubEnv('API_INTERNAL_KEY', 'test-secret');
    const { getApiHeaders } = await import('../src/lib/api.js');
    const headers = getApiHeaders() as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-secret');
  });

  it('returns empty headers when API_INTERNAL_KEY is not set', async () => {
    delete process.env.API_INTERNAL_KEY;
    const { getApiHeaders } = await import('../src/lib/api.js');
    const headers = getApiHeaders() as Record<string, string>;
    expect(headers['x-api-key']).toBeUndefined();
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('API_URL falls back to localhost:3002 when env not set', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const { API_URL } = await import('../src/lib/api.js');
    expect(API_URL).toBe('http://localhost:3002');
  });
});
