/**
 * Tests for auth middleware (middleware/auth.ts)
 *
 * Tests API key validation, route tier classification, and IDOR prevention.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

vi.mock('@playbook/shared-llm', () => ({
  createUserContext: vi.fn().mockReturnValue({
    userId: 'test-api-key',
    source: 'api_key',
  }),
}));

import {
  getRequiredTier,
  getAuthMode,
  authenticateRequest,
  validateAuthConfig,
  verifyUserOwnership,
  clearApiKeyCache,
} from '../src/middleware/auth.js';

function createMockReq(
  method: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  return { method, headers } as unknown as IncomingMessage;
}

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

// ─── getRequiredTier ───

describe('getRequiredTier', () => {
  it('returns public for GET /api/health', () => {
    expect(getRequiredTier('/api/health', 'GET')).toBe('public');
  });

  it('returns public for GET /api/entries', () => {
    expect(getRequiredTier('/api/entries', 'GET')).toBe('public');
  });

  it('returns public for GET /api/users', () => {
    expect(getRequiredTier('/api/users', 'GET')).toBe('public');
  });

  it('returns admin for POST /api/prompts', () => {
    expect(getRequiredTier('/api/prompts', 'POST')).toBe('admin');
  });

  it('returns admin for PATCH /api/prompts/id/traffic', () => {
    expect(getRequiredTier('/api/prompts/v1/traffic', 'PATCH')).toBe('admin');
  });

  it('returns user for GET /api/prompts/name/active', () => {
    expect(getRequiredTier('/api/prompts/system/active', 'GET')).toBe('user');
  });

  it('returns admin for POST /api/costs/reset', () => {
    expect(getRequiredTier('/api/costs/reset', 'POST')).toBe('admin');
  });

  it('returns user for GET /api/costs', () => {
    expect(getRequiredTier('/api/costs', 'GET')).toBe('user');
  });

  it('returns admin for POST /api/composio/execute', () => {
    expect(getRequiredTier('/api/composio/execute', 'POST')).toBe('admin');
  });

  it('returns user for GET /api/composio/actions', () => {
    expect(getRequiredTier('/api/composio/actions', 'GET')).toBe('user');
  });

  it('returns admin for POST /api/openpipe/finetune', () => {
    expect(getRequiredTier('/api/openpipe/finetune', 'POST')).toBe('admin');
  });

  it('returns admin for POST /api/documents', () => {
    expect(getRequiredTier('/api/documents', 'POST')).toBe('admin');
  });

  it('returns admin for POST /api/documents/upload', () => {
    expect(getRequiredTier('/api/documents/upload', 'POST')).toBe('admin');
  });

  it('returns user for GET /api/documents', () => {
    expect(getRequiredTier('/api/documents', 'GET')).toBe('user');
  });

  it('returns admin for POST /api/few-shot', () => {
    expect(getRequiredTier('/api/few-shot', 'POST')).toBe('admin');
  });

  it('returns admin for POST /api/few-shot/build', () => {
    expect(getRequiredTier('/api/few-shot/build', 'POST')).toBe('admin');
  });

  it('returns admin for DELETE /api/few-shot/id', () => {
    expect(getRequiredTier('/api/few-shot/fs-1', 'DELETE')).toBe('admin');
  });

  it('returns user for GET /api/few-shot', () => {
    expect(getRequiredTier('/api/few-shot?taskType=summarize', 'GET')).toBe('user');
  });

  it('returns user for GET /api/preferences/userId', () => {
    expect(getRequiredTier('/api/preferences/user1', 'GET')).toBe('user');
  });

  it('returns user for GET /api/generations', () => {
    expect(getRequiredTier('/api/generations?userId=user1', 'GET')).toBe('user');
  });

  it('returns user for POST /api/memory', () => {
    expect(getRequiredTier('/api/memory', 'POST')).toBe('user');
  });

  it('returns admin for POST /api/ingest', () => {
    expect(getRequiredTier('/api/ingest', 'POST')).toBe('admin');
  });
});

// ─── authenticateRequest ───

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearApiKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearApiKeyCache();
  });

  it('passes public routes without x-api-key', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/health');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('public');
  });

  it('returns 401 when no auth is provided on user routes', async () => {
    vi.stubEnv('API_KEYS', 'key-1,key-2');
    clearApiKeyCache();
    const req = createMockReq('GET');
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
  });

  it('returns 401 when x-api-key is invalid', async () => {
    vi.stubEnv('API_KEYS', 'key-1,key-2');
    clearApiKeyCache();
    const req = createMockReq('GET', { 'x-api-key': 'wrong-key' });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
    expect(res._body).toContain('invalid API key');
  });

  it('passes when x-api-key is valid', async () => {
    vi.stubEnv('API_KEYS', 'key-1,key-2');
    clearApiKeyCache();
    const req = createMockReq('GET', { 'x-api-key': 'key-1' });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('user');
    expect(result!.authMethod).toBe('api-key');
  });

  it('passes in AUTH_MODE=open when no valid key provided', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    const req = createMockReq('GET', {});
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('user');
    expect(result!.authMethod).toBe('none');
  });

  it('rejects invalid key in AUTH_MODE=strict even with no API_KEYS', async () => {
    vi.stubEnv('AUTH_MODE', 'strict');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    const req = createMockReq('GET', { 'x-api-key': 'any-key' });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
  });

  it('returns 403 when x-admin-key is missing on admin routes', async () => {
    vi.stubEnv('API_KEYS', 'key-1');
    vi.stubEnv('ADMIN_API_KEY', 'admin-secret');
    clearApiKeyCache();
    const req = createMockReq('POST', { 'x-api-key': 'key-1' });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/prompts');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(403);
    expect(res._body).toContain('admin access required');
  });

  it('returns 403 when x-admin-key is wrong', async () => {
    vi.stubEnv('API_KEYS', 'key-1');
    vi.stubEnv('ADMIN_API_KEY', 'admin-secret');
    clearApiKeyCache();
    const req = createMockReq('POST', {
      'x-api-key': 'key-1',
      'x-admin-key': 'wrong-admin',
    });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/prompts');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(403);
  });

  it('passes admin routes when both keys are valid', async () => {
    vi.stubEnv('API_KEYS', 'key-1');
    vi.stubEnv('ADMIN_API_KEY', 'admin-secret');
    clearApiKeyCache();
    const req = createMockReq('POST', {
      'x-api-key': 'key-1',
      'x-admin-key': 'admin-secret',
    });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/prompts');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('admin');
    expect(result!.authMethod).toBe('api-key');
  });

  it('returns 403 when ADMIN_API_KEY env is not set', async () => {
    vi.stubEnv('API_KEYS', 'key-1');
    vi.stubEnv('ADMIN_API_KEY', '');
    delete process.env.ADMIN_API_KEY;
    clearApiKeyCache();
    const req = createMockReq('POST', {
      'x-api-key': 'key-1',
      'x-admin-key': 'anything',
    });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/costs/reset');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(403);
  });
});

// ─── getAuthMode ───

describe('getAuthMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns strict by default', () => {
    vi.stubEnv('AUTH_MODE', '');
    expect(getAuthMode()).toBe('strict');
  });

  it('returns open when AUTH_MODE=open and not production', () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('NODE_ENV', 'test');
    expect(getAuthMode()).toBe('open');
  });

  it('returns strict when AUTH_MODE=open in production (no break-glass)', () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.AUTH_ALLOW_OPEN_IN_PRODUCTION;
    expect(getAuthMode()).toBe('strict');
  });

  it('returns open when AUTH_MODE=open in production with break-glass', () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_ALLOW_OPEN_IN_PRODUCTION', 'true');
    expect(getAuthMode()).toBe('open');
  });
});

// ─── Auth hardening: open mode + admin routes ───

describe('Auth hardening: open mode + admin enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearApiKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearApiKeyCache();
  });

  it('open mode + admin route + no admin key → 403', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('ADMIN_API_KEY', 'admin-secret');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    const req = createMockReq('POST', {});
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/costs/reset');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(403);
    expect(res._body).toContain('admin access required');
  });

  it('open mode + admin route + valid admin key → pass', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('ADMIN_API_KEY', 'admin-secret');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    const req = createMockReq('POST', { 'x-admin-key': 'admin-secret' });
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/costs/reset');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('admin');
    expect(result!.authMethod).toBe('none');
  });

  it('production + AUTH_MODE=open → falls back to strict (401 without creds)', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_KEYS', 'key-1');
    delete process.env.AUTH_ALLOW_OPEN_IN_PRODUCTION;
    clearApiKeyCache();
    const req = createMockReq('GET', {});
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).toBeNull();
    expect(res._statusCode).toBe(401);
  });

  it('production + AUTH_MODE=open + break-glass → open mode active', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_ALLOW_OPEN_IN_PRODUCTION', 'true');
    vi.stubEnv('ADMIN_API_KEY', 'admin-secret');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    const req = createMockReq('GET', {});
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).not.toBeNull();
    expect(result!.authMethod).toBe('none');
  });

  it('open mode + user route → passes without auth', async () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    const req = createMockReq('GET', {});
    const res = createMockRes();
    const result = await authenticateRequest(req, res, '/api/preferences/user1');
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('user');
    expect(result!.authMethod).toBe('none');
  });

  it('POST /api/ingest requires admin tier', () => {
    expect(getRequiredTier('/api/ingest', 'POST')).toBe('admin');
  });

  it('GET /api/ingest/types requires user tier (default)', () => {
    expect(getRequiredTier('/api/ingest/types', 'GET')).toBe('user');
  });
});

// ─── validateAuthConfig ───

describe('validateAuthConfig', () => {
  beforeEach(() => {
    clearApiKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearApiKeyCache();
  });

  it('throws in strict mode with no auth providers', () => {
    vi.stubEnv('AUTH_MODE', 'strict');
    vi.stubEnv('API_KEYS', '');
    vi.stubEnv('API_INTERNAL_KEY', '');
    delete process.env.CLERK_SECRET_KEY;
    clearApiKeyCache();
    expect(() => validateAuthConfig()).toThrow('no auth providers configured');
  });

  it('passes in strict mode with API_KEYS set', () => {
    vi.stubEnv('AUTH_MODE', 'strict');
    vi.stubEnv('API_KEYS', 'key-1');
    clearApiKeyCache();
    expect(() => validateAuthConfig()).not.toThrow();
  });

  it('passes in open mode without throwing', () => {
    vi.stubEnv('AUTH_MODE', 'open');
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    expect(() => validateAuthConfig()).not.toThrow();
  });
});

// ─── verifyUserOwnership ───

describe('verifyUserOwnership', () => {
  beforeEach(() => {
    clearApiKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearApiKeyCache();
  });

  it('returns true when path userId matches authenticated userId', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/preferences/user-1', 'user-1')).toBe(true);
  });

  it('returns false when path userId does not match', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/preferences/other-user', 'user-1')).toBe(false);
  });

  it('returns true when query userId matches', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/generations?userId=user-1', 'user-1')).toBe(true);
  });

  it('returns false when query userId does not match', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/generations?userId=other-user', 'user-1')).toBe(false);
  });

  it('returns true when no userId in URL', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/costs', 'user-1')).toBe(true);
  });

  it('handles URL-encoded userIds', () => {
    vi.stubEnv('API_KEYS', 'user@example.com');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/preferences/user%40example.com', 'user@example.com')).toBe(true);
  });

  it('skips IDOR for /api/memory/search (not a userId)', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/memory/search?q=dark&userId=user-1', 'user-1')).toBe(true);
  });

  it('returns false for /api/memory/:userId mismatch', () => {
    vi.stubEnv('API_KEYS', 'user-1');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/memory/other-user', 'user-1')).toBe(false);
  });

  it('enforces IDOR even when API_KEYS is empty (IDOR bypass now in server.ts via authMethod)', () => {
    vi.stubEnv('API_KEYS', '');
    clearApiKeyCache();
    expect(verifyUserOwnership('/api/preferences/any-user', 'different-user')).toBe(false);
  });
});
