/**
 * Tests for document ingestion routes (routes/documents.ts)
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
  documents: {
    id: 'id',
    title: 'title',
    sourceUrl: 'source_url',
    mimeType: 'mime_type',
    contentHash: 'content_hash',
    chunkCount: 'chunk_count',
    embeddingModelId: 'embedding_model_id',
    ingestedAt: 'ingested_at',
    validUntil: 'valid_until',
    metadata: 'metadata',
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
  documents: {
    id: 'id',
    title: 'title',
    sourceUrl: 'source_url',
    mimeType: 'mime_type',
    contentHash: 'content_hash',
    chunkCount: 'chunk_count',
    embeddingModelId: 'embedding_model_id',
    ingestedAt: 'ingested_at',
    validUntil: 'valid_until',
    metadata: 'metadata',
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

vi.mock('node:crypto', () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({
      digest: vi.fn().mockReturnValue('mock-sha256-hash'),
    }),
  }),
}));

vi.mock('@playbook/shared-llm', () => ({
  createUserContext: vi.fn().mockReturnValue({ userId: 'test-user', source: 'ip' }),
  withLangfuseHeaders: vi.fn().mockReturnValue({}),
  createLLMClient: vi.fn().mockReturnValue({
    embeddings: { create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] }) },
  }),
  costLedger: { recordCall: vi.fn() },
  parseDocument: vi.fn(),
  isSupportedMimeType: vi.fn(),
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

import { handleDocumentRoutes } from '../src/routes/documents.js';
import { isSupportedMimeType, parseDocument } from '@playbook/shared-llm';
import { checkTokenBudget } from '../src/rate-limiter.js';
import { checkCostBudget } from '../src/cost-guard.js';

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

/** Create a mock req that streams raw body data (for /upload routes). */
function createUploadMockReq(
  body: Buffer,
  contentType: string,
  title = 'Test Upload',
): IncomingMessage {
  return {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-document-title': title },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === 'data' && body.length > 0) handler(body);
      if (event === 'end') handler();
    },
  } as unknown as IncomingMessage;
}

describe('handleDocumentRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/documents ──────────────────────────────────────────────────

  it('POST /api/documents returns 400 when required fields are missing', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents', createBodyParser({ title: 'Test' }));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/documents returns 400 when title is missing', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents', createBodyParser({ content: 'Some text' }));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/documents creates document with dedup check and returns 201', async () => {
    // Mock: dedup check returns empty (no duplicate)
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    // Mock: insert document
    const createdDoc = {
      id: 'doc-uuid-1',
      title: 'Test Doc',
      contentHash: 'mock-sha256-hash',
      chunkCount: 1,
      embeddingModelId: 'text-embedding-3-small',
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdDoc]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleDocumentRoutes(
      req, res, '/api/documents',
      createBodyParser({ title: 'Test Doc', content: 'Hello world content' }),
    );
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.document).toBeDefined();
  });

  it('POST /api/documents returns existing doc when content hash matches (dedup)', async () => {
    const existingDoc = {
      id: 'existing-doc-id',
      title: 'Already Ingested',
      contentHash: 'mock-sha256-hash',
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingDoc]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleDocumentRoutes(
      req, res, '/api/documents',
      createBodyParser({ title: 'Dup Doc', content: 'Duplicate content' }),
    );
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.duplicate).toBe(true);
    expect(body.document).toBeDefined();
  });

  // ── POST /api/documents/upload ───────────────────────────────────────────

  it('POST /api/documents/upload returns 400 for unsupported MIME type', async () => {
    vi.mocked(isSupportedMimeType).mockReturnValue(false);

    const req = createMockReq('POST');
    req.headers = { 'content-type': 'image/png', 'x-document-title': 'Test' };
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/upload', createBodyParser({}));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Unsupported Content-Type');
  });

  // ── GET /api/documents ───────────────────────────────────────────────────

  it('GET /api/documents returns a list of documents', async () => {
    const mockDocs = [
      { id: 'doc-1', title: 'Doc One' },
      { id: 'doc-2', title: 'Doc Two' },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(mockDocs),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(2);
  });

  // ── GET /api/documents/:id ───────────────────────────────────────────────

  it('GET /api/documents/:id returns the document when found', async () => {
    const mockDoc = { id: 'doc-uuid-1', title: 'Found Doc', contentHash: 'abc' };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockDoc]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/doc-uuid-1', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.title).toBe('Found Doc');
  });

  it('GET /api/documents/:id returns 404 when document is not found', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/nonexistent-id', createBodyParser({}));
    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('Document not found');
  });

  // ── POST /api/documents/upload — branch coverage ─────────────────────────

  it('POST /api/documents/upload returns 400 for empty body', async () => {
    vi.mocked(isSupportedMimeType).mockReturnValue(true);

    const req = createUploadMockReq(Buffer.alloc(0), 'application/pdf');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/upload', createBodyParser({}));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Empty body');
  });

  it('POST /api/documents/upload returns 502 when parser returns null', async () => {
    vi.mocked(isSupportedMimeType).mockReturnValue(true);
    vi.mocked(parseDocument).mockResolvedValue(null);

    const req = createUploadMockReq(Buffer.from('fake-pdf-data'), 'application/pdf');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/upload', createBodyParser({}));
    expect(res._statusCode).toBe(502);
    expect(res._body).toContain('Document parsing failed');
  });

  it('POST /api/documents/upload returns 429 when token budget exceeded', async () => {
    vi.mocked(isSupportedMimeType).mockReturnValue(true);
    vi.mocked(parseDocument).mockResolvedValue({ text: 'Parsed content from PDF', pageCount: 1 });
    vi.mocked(checkTokenBudget).mockResolvedValueOnce({ allowed: false, limit: 100_000, remaining: 0 });
    // Dedup: no existing doc
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    const req = createUploadMockReq(Buffer.from('pdf-data'), 'application/pdf');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/upload', createBodyParser({}));
    expect(res._statusCode).toBe(429);
    expect(res._body).toContain('Token budget exceeded');
  });

  it('POST /api/documents/upload returns 429 when cost budget exceeded', async () => {
    vi.mocked(isSupportedMimeType).mockReturnValue(true);
    vi.mocked(parseDocument).mockResolvedValue({ text: 'Parsed content from PDF', pageCount: 1 });
    vi.mocked(checkTokenBudget).mockResolvedValueOnce({ allowed: true, limit: 100_000, remaining: 99_000 });
    vi.mocked(checkCostBudget).mockReturnValueOnce({
      allowed: false,
      report: { totalCostUSD: 10, totalInputTokens: 0, totalOutputTokens: 0, byAgent: {}, currency: 'USD' },
    });
    // Dedup: no existing doc
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    const req = createUploadMockReq(Buffer.from('pdf-data'), 'application/pdf');
    const res = createMockRes();
    await handleDocumentRoutes(req, res, '/api/documents/upload', createBodyParser({}));
    expect(res._statusCode).toBe(429);
    expect(res._body).toContain('Cost budget exceeded');
  });

  // ── POST /api/documents — token/cost budget branches ───────────────────

  it('POST /api/documents returns 429 when token budget exceeded', async () => {
    vi.mocked(checkTokenBudget).mockResolvedValueOnce({ allowed: false, limit: 100_000, remaining: 0 });
    // Dedup: no existing doc
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleDocumentRoutes(
      req, res, '/api/documents',
      createBodyParser({ title: 'Budget Test', content: 'Some content' }),
    );
    expect(res._statusCode).toBe(429);
    expect(res._body).toContain('Token budget exceeded');
  });

  it('POST /api/documents returns 429 when cost budget exceeded', async () => {
    vi.mocked(checkTokenBudget).mockResolvedValueOnce({ allowed: true, limit: 100_000, remaining: 99_000 });
    vi.mocked(checkCostBudget).mockReturnValueOnce({
      allowed: false,
      report: { totalCostUSD: 10, totalInputTokens: 0, totalOutputTokens: 0, byAgent: {}, currency: 'USD' },
    });
    // Dedup: no existing doc
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleDocumentRoutes(
      req, res, '/api/documents',
      createBodyParser({ title: 'Cost Test', content: 'Some content' }),
    );
    expect(res._statusCode).toBe(429);
    expect(res._body).toContain('Cost budget exceeded');
  });
});
