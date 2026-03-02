/**
 * Tests for strategy provider availability policy (middleware/provider-policy.ts)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import {
  getStrategyProviderMode,
  isStrategyProviderConfigured,
  enforceProviderAvailability,
} from '../src/middleware/provider-policy.js';

function createMockRes(): ServerResponse & { _body: string; _statusCode: number } {
  const res = {
    statusCode: 200,
    writableEnded: false,
    _body: '',
    _statusCode: 200,
    end(body?: string) {
      this._body = body ?? '';
      this._statusCode = this.statusCode;
      this.writableEnded = true;
    },
  } as unknown as ServerResponse & { _body: string; _statusCode: number };
  return res;
}

describe('provider policy mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to open in non-production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.STRATEGY_PROVIDER_MODE;
    expect(getStrategyProviderMode()).toBe('open');
  });

  it('defaults to strict in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.STRATEGY_PROVIDER_MODE;
    expect(getStrategyProviderMode()).toBe('strict');
  });

  it('rejects open mode in production without break-glass', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRATEGY_PROVIDER_MODE', 'open');
    delete process.env.STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION;
    expect(getStrategyProviderMode()).toBe('strict');
  });

  it('allows open mode in production with break-glass', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRATEGY_PROVIDER_MODE', 'open');
    vi.stubEnv('STRATEGY_PROVIDER_ALLOW_OPEN_IN_PRODUCTION', 'true');
    expect(getStrategyProviderMode()).toBe('open');
  });
});

describe('provider configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('recognizes memory provider via MEMORY_PROVIDER=zep + ZEP_API_KEY', () => {
    vi.stubEnv('MEMORY_PROVIDER', 'zep');
    vi.stubEnv('ZEP_API_KEY', 'zep-key');
    delete process.env.MEM0_API_KEY;
    expect(isStrategyProviderConfigured('memory')).toBe(true);
  });

  it('fails strict enforcement with 503 when composio is missing', () => {
    vi.stubEnv('STRATEGY_PROVIDER_MODE', 'strict');
    vi.stubEnv('COMPOSIO_API_KEY', '');
    delete process.env.COMPOSIO_API_KEY;

    const res = createMockRes();
    const available = enforceProviderAvailability('composio', res);

    expect(available).toBe(false);
    expect(res._statusCode).toBe(503);
    expect(res._body).toContain('strict mode');
  });
});
