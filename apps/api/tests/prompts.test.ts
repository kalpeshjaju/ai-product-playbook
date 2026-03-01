/**
 * Tests for prompt versioning routes (routes/prompts.ts)
 *
 * Mocks the Drizzle db to test route handler logic without a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Mock the db module
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockResolvePromptWithAB = vi.fn();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('../src/db/schema.js', () => ({
  promptVersions: { promptName: 'prompt_name', version: 'version', activePct: 'active_pct', id: 'id', createdAt: 'created_at', evalScore: 'eval_score', contentHash: 'content_hash' },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  gt: (a: unknown, b: unknown) => [a, '>', b],
  sql: (strings: TemplateStringsArray) => strings.join(''),
  sum: (col: unknown) => col,
}));

vi.mock('../src/middleware/prompt-ab.js', () => ({
  resolvePromptWithAB: (...args: unknown[]) => mockResolvePromptWithAB(...args),
}));

import { handlePromptRoutes } from '../src/routes/prompts.js';

function createMockReq(method: string): IncomingMessage {
  return { method, headers: {} } as IncomingMessage;
}

function createMockRes(): ServerResponse & { _body: string; _statusCode: number } {
  const res = {
    statusCode: 200,
    _body: '',
    _statusCode: 200,
    end(body?: string) {
      this._body = body ?? '';
      this._statusCode = this.statusCode;
    },
  } as unknown as ServerResponse & { _body: string; _statusCode: number };
  return res;
}

function createBodyParser(body: Record<string, unknown>): (req: IncomingMessage) => Promise<Record<string, unknown>> {
  return () => Promise.resolve(body);
}

describe('handlePromptRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePromptWithAB.mockResolvedValue(null);
  });

  it('GET /active returns 404 when no active versions exist', async () => {
    // Mock: select().from().where() returns empty array
    const chainable = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(chainable);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handlePromptRoutes(req, res, '/api/prompts/test-prompt/active', createBodyParser({}));
    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('No active versions');
  });

  it('GET /active returns a prompt version when active versions exist', async () => {
    const mockRow = {
      promptName: 'test-prompt',
      version: 'v1.0.0',
      content: 'Hello {{name}}',
      contentHash: 'abc123',
      evalScore: '0.85',
      activePct: 50,
    };
    const chainable = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([mockRow]),
    };
    mockSelect.mockReturnValue(chainable);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handlePromptRoutes(req, res, '/api/prompts/test-prompt/active', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.prompt_name).toBe('test-prompt');
    expect(body.version).toBe('v1.0.0');
  });

  it('POST /api/prompts returns 400 when missing required fields', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handlePromptRoutes(req, res, '/api/prompts', createBodyParser({ prompt_name: 'test' }));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/prompts creates a new version with auto-increment', async () => {
    // Mock: get latest version
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ version: 'v1.2.0' }]),
    };
    mockSelect.mockReturnValue(selectChain);

    // Mock: insert
    const created = {
      id: 'uuid-1',
      promptName: 'test',
      version: 'v1.3.0',
      content: 'New content',
      contentHash: 'hash',
      evalScore: null,
      activePct: 0,
      author: 'test-user',
      createdAt: new Date().toISOString(),
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([created]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handlePromptRoutes(
      req, res, '/api/prompts',
      createBodyParser({ prompt_name: 'test', content: 'New content', author: 'test-user' }),
    );
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.version).toBe('v1.3.0');
  });

  it('returns 404 for unmatched prompt routes', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handlePromptRoutes(req, res, '/api/prompts/unknown/path', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });
});
