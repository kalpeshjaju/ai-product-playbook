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
    await handleEmbeddingRoutes(req, res, '/api/embeddings/search?modelId=text-embedding-3-small', createBodyParser({}));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required query param: q');
  });

  it('GET /api/embeddings/search returns 400 when modelId is missing (§19 HARD GATE)', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(req, res, '/api/embeddings/search?q=test+query', createBodyParser({}));
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
    );
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.id).toBe('emb-uuid-1');
    expect(body.sourceType).toBe('document');
  });

  // ── 404 fallthrough ──────────────────────────────────────────────────────

  it('returns 404 for unmatched embedding routes', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEmbeddingRoutes(req, res, '/api/embeddings/unknown', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });
});
