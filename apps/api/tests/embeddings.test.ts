/**
 * Tests for embedding search + insertion routes (routes/embeddings.ts)
 *
 * Mocks the Drizzle db to test route handler logic without a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Mock the db module
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    execute: vi.fn().mockResolvedValue([]),
  },
  embeddings: {
    id: 'id',
    sourceType: 'source_type',
    sourceId: 'source_id',
    contentHash: 'content_hash',
    embedding: 'embedding',
    modelId: 'model_id',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
}));

vi.mock('../src/db/schema.js', () => ({
  embeddings: {
    id: 'id',
    sourceType: 'source_type',
    sourceId: 'source_id',
    contentHash: 'content_hash',
    embedding: 'embedding',
    modelId: 'model_id',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  gt: (a: unknown, b: unknown) => [a, '>', b],
  desc: (a: unknown) => [a, 'desc'],
  gte: (a: unknown, b: unknown) => [a, '>=', b],
  isNotNull: (a: unknown) => [a, 'is not null'],
  sql: (strings: TemplateStringsArray) => strings.join(''),
  sum: (col: unknown) => col,
}));

vi.mock('@playbook/shared-llm', () => ({
  createUserContext: vi.fn().mockReturnValue({ userId: 'test-user', source: 'ip' }),
  withLangfuseHeaders: vi.fn().mockReturnValue({}),
  createLLMClient: vi.fn().mockReturnValue({
    embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] }) },
  }),
  costLedger: { recordCall: vi.fn() },
}));

vi.mock('../src/rate-limiter.js', () => ({
  checkTokenBudget: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 100_000,
    remaining: 99_000,
  }),
}));

vi.mock('../src/cost-guard.js', () => ({
  checkCostBudget: vi.fn().mockReturnValue({
    allowed: true,
    report: {
      totalCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byAgent: {},
      currency: 'USD',
    },
  }),
}));

import { handleEmbeddingRoutes } from '../src/routes/embeddings.js';
import { createLLMClient } from '@playbook/shared-llm';
import { checkTokenBudget } from '../src/rate-limiter.js';
import { checkCostBudget } from '../src/cost-guard.js';
import type { AuthResult } from '../src/middleware/auth.js';

/** Default auth result for tests. */
function createMockAuth(userId = 'test-user'): AuthResult {
  return {
    userContext: { userId, source: 'ip' },
    tier: 'user',
    authMethod: 'api-key',
  };
}

function createMockReq(method: string): IncomingMessage {
  return { method, headers: {} } as IncomingMessage;
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

function createBodyParser(body: Record<string, unknown>): (req: IncomingMessage) => Promise<Record<string, unknown>> {
  return () => Promise.resolve(body);
}

describe('handleEmbeddingRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /api/embeddings/search ───────────────────────────────────────────

  it('GET /api/embeddings/search returns 400 when q param is missing', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(req, res, '/api/embeddings/search?modelId=text-embedding-3-small', createBodyParser({}), createMockAuth());
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required query param: q');
  });

  it('GET /api/embeddings/search returns 400 when modelId is missing (§19 HARD GATE)', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(req, res, '/api/embeddings/search?q=test+query', createBodyParser({}), createMockAuth());
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('modelId');
    expect(res._body).toContain('HARD GATE');
  });

  // ── POST /api/embeddings ─────────────────────────────────────────────────

  it('POST /api/embeddings returns 400 when required fields are missing', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res, '/api/embeddings',
      createBodyParser({ sourceType: 'document', sourceId: 'doc-1' }),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/embeddings returns 400 when only partial fields provided', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res, '/api/embeddings',
      createBodyParser({ sourceType: 'document' }),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/embeddings creates embedding row and returns 201', async () => {
    const createdRow = {
      id: 'emb-uuid-1',
      sourceType: 'document',
      sourceId: 'doc-1',
      contentHash: 'hash-abc',
      embedding: [0.1, 0.2, 0.3],
      modelId: 'text-embedding-3-small',
      metadata: null,
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdRow]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res, '/api/embeddings',
      createBodyParser({
        sourceType: 'document',
        sourceId: 'doc-1',
        contentHash: 'hash-abc',
        embedding: [0.1, 0.2, 0.3],
        modelId: 'text-embedding-3-small',
      }),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.id).toBe('emb-uuid-1');
    expect(body.sourceType).toBe('document');
  });

  // ── GET /api/embeddings/search — success + budget + failure branches ────

  it('GET /api/embeddings/search returns results on success', async () => {
    const mockExecute = vi.fn().mockResolvedValue([
      { id: 'emb-1', source_type: 'document', source_id: 'doc-1', similarity: 0.95, metadata: {} },
    ]);
    const { db } = await import('../src/db/index.js');
    db.execute = mockExecute;

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res,
      '/api/embeddings/search?q=test+query&modelId=text-embedding-3-small',
      createBodyParser({}),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(1);
  });

  it('GET /api/embeddings/search returns 429 when token budget exceeded', async () => {
    vi.mocked(checkTokenBudget).mockResolvedValueOnce({ allowed: false, limit: 100_000, remaining: 0 });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res,
      '/api/embeddings/search?q=test&modelId=text-embedding-3-small',
      createBodyParser({}),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(429);
    expect(res._body).toContain('Token budget exceeded');
  });

  it('GET /api/embeddings/search returns 429 when cost budget exceeded', async () => {
    vi.mocked(checkTokenBudget).mockResolvedValueOnce({ allowed: true, limit: 100_000, remaining: 99_000 });
    vi.mocked(checkCostBudget).mockReturnValueOnce({
      allowed: false,
      report: { totalCostUSD: 10, totalInputTokens: 0, totalOutputTokens: 0, byAgent: {}, currency: 'USD' },
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res,
      '/api/embeddings/search?q=test&modelId=text-embedding-3-small',
      createBodyParser({}),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(429);
    expect(res._body).toContain('Cost budget exceeded');
  });

  it('GET /api/embeddings/search returns 502 when embedding fails', async () => {
    vi.mocked(createLLMClient).mockReturnValueOnce({
      embeddings: {
        create: vi.fn().mockRejectedValue(new Error('LiteLLM down')),
      },
    } as unknown as ReturnType<typeof createLLMClient>);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(
      req, res,
      '/api/embeddings/search?q=test&modelId=text-embedding-3-small',
      createBodyParser({}),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(502);
    expect(res._body).toContain('Failed to generate query embedding');
  });

  // ── 404 fallthrough ──────────────────────────────────────────────────────

  it('returns 404 for unmatched embedding routes', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(req, res, '/api/embeddings/unknown', createBodyParser({}), createMockAuth());
    expect(res._statusCode).toBe(404);
  });
});
