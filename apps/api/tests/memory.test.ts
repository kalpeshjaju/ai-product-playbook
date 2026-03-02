/**
 * Tests for memory API routes (routes/memory.ts)
 *
 * Mocks shared-llm memory provider to test route handler logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const { mockAdd, mockSearch, mockGetAll, mockDeleteMem } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockSearch: vi.fn(),
  mockGetAll: vi.fn(),
  mockDeleteMem: vi.fn(),
}));

vi.mock('@playbook/shared-llm', () => ({
  createMemoryProvider: vi.fn().mockReturnValue({
    add: mockAdd,
    search: mockSearch,
    getAll: mockGetAll,
    delete: mockDeleteMem,
  }),
  scanOutput: vi.fn().mockResolvedValue({ passed: true, findings: [], scanTimeMs: 0, scannersRun: ['regex'] }),
}));

import { handleMemoryRoutes } from '../src/routes/memory.js';
import { scanOutput } from '@playbook/shared-llm';

function createMockReq(method: string): IncomingMessage {
  return { method, headers: {} } as unknown as IncomingMessage;
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

describe('handleMemoryRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MEM0_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns disabled message when no memory provider configured', async () => {
    vi.stubEnv('MEM0_API_KEY', '');
    delete process.env.MEM0_API_KEY;
    delete process.env.ZEP_API_KEY;

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/user1', createBodyParser({}));
    expect(res._statusCode).toBe(503);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.enabled).toBe(false);
  });

  it('POST /api/memory validates required fields', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory', createBodyParser({ content: 'test' }));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/memory creates a memory', async () => {
    mockAdd.mockResolvedValue('mem-1');

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory', createBodyParser({
      content: 'User prefers dark mode',
      userId: 'user1',
    }));
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.id).toBe('mem-1');
  });

  it('GET /api/memory/search validates query params', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/search?q=test', createBodyParser({}));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('userId');
  });

  it('GET /api/memory/search returns search results', async () => {
    mockSearch.mockResolvedValue([{
      entry: { id: 'mem-1', content: 'dark mode', userId: 'user1', createdAt: '2026-03-01T00:00:00Z' },
      score: 0.95,
    }]);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/search?q=dark&userId=user1', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(1);
  });

  it('GET /api/memory/:userId returns user memories', async () => {
    mockGetAll.mockResolvedValue([{ id: 'mem-1', content: 'preference' }]);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/user1', createBodyParser({}));
    expect(res._statusCode).toBe(200);
  });

  it('DELETE /api/memory/:id deletes a memory', async () => {
    mockDeleteMem.mockResolvedValue(undefined);

    const req = createMockReq('DELETE');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/mem-1', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.deleted).toBe('mem-1');
  });

  it('returns 404 for unmatched routes', async () => {
    const req = createMockReq('PUT');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });

  // ── Guardrail 422 blocks ─────────────────────────────────────────────────

  it('GET /api/memory/search returns 422 when guardrail blocks content', async () => {
    mockSearch.mockResolvedValue([{
      entry: { id: 'mem-1', content: 'sensitive data', userId: 'user1', createdAt: '2026-03-01T00:00:00Z' },
      score: 0.9,
    }]);
    vi.mocked(scanOutput).mockResolvedValueOnce({
      passed: false,
      findings: [{ scanner: 'regex', category: 'pii_leakage', description: 'PII detected', severity: 'high' }],
      scanTimeMs: 1,
      scannersRun: ['regex'],
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/search?q=sensitive&userId=user1', createBodyParser({}));
    expect(res._statusCode).toBe(422);
    expect(res._body).toContain('blocked by output guardrail');
  });

  it('GET /api/memory/:userId returns 422 when guardrail blocks content', async () => {
    mockGetAll.mockResolvedValue([{ id: 'mem-1', content: 'blocked content' }]);
    vi.mocked(scanOutput).mockResolvedValueOnce({
      passed: false,
      findings: [{ scanner: 'regex', category: 'prompt_injection', description: 'Injection detected', severity: 'critical' }],
      scanTimeMs: 1,
      scannersRun: ['regex'],
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMemoryRoutes(req, res, '/api/memory/user1', createBodyParser({}));
    expect(res._statusCode).toBe(422);
    expect(res._body).toContain('blocked by output guardrail');
  });
});
