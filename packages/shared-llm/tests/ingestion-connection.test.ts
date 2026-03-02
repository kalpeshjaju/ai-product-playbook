/**
 * FILE PURPOSE: Tests for Redis connection URL parsing
 * WHY: parseRedisConnection handles TLS, password, port defaults, and env fallback.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseRedisConnection } from '../src/ingestion/pipeline/connection.js';

describe('parseRedisConnection', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses a standard redis:// URL', () => {
    const result = parseRedisConnection('redis://myhost:6380');
    expect(result.host).toBe('myhost');
    expect(result.port).toBe(6380);
    expect(result.password).toBeUndefined();
    expect(result.tls).toBeUndefined();
  });

  it('enables TLS for rediss:// URLs', () => {
    const result = parseRedisConnection('rediss://secure-host:6380');
    expect(result.host).toBe('secure-host');
    expect(result.tls).toEqual({});
  });

  it('extracts password from URL', () => {
    const result = parseRedisConnection('redis://:s3cret@myhost:6379');
    expect(result.password).toBe('s3cret');
  });

  it('defaults port to 6379 when not specified', () => {
    const result = parseRedisConnection('redis://myhost');
    expect(result.port).toBe(6379);
  });

  it('falls back to REDIS_URL env var when no argument provided', () => {
    vi.stubEnv('REDIS_URL', 'redis://env-host:7777');
    const result = parseRedisConnection();
    expect(result.host).toBe('env-host');
    expect(result.port).toBe(7777);
  });

  it('falls back to localhost:6379 when no argument and no env var', () => {
    delete process.env.REDIS_URL;
    const result = parseRedisConnection();
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6379);
  });
});
