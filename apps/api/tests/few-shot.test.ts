/**
 * Tests for few-shot bank routes (routes/few-shot.ts)
 *
 * Mocks the Drizzle db to test route handler logic without a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── DB mocks ────────────────────────────────────────────────────────────────
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  fewShotBank: {
    id: 'id',
    taskType: 'task_type',
    inputText: 'input_text',
    outputText: 'output_text',
    qualityScore: 'quality_score',
    sourceGenerationId: 'source_generation_id',
    curatedBy: 'curated_by',
    isActive: 'is_active',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
  aiGenerations: {
    id: 'id',
    taskType: 'task_type',
    qualityScore: 'quality_score',
    thumbs: 'thumbs',
    userFeedback: 'user_feedback',
    promptHash: 'prompt_hash',
    responseHash: 'response_hash',
    model: 'model',
    latencyMs: 'latency_ms',
    createdAt: 'created_at',
  },
}));

vi.mock('../src/db/schema.js', () => ({
  fewShotBank: {
    id: 'id',
    taskType: 'task_type',
    inputText: 'input_text',
    outputText: 'output_text',
    qualityScore: 'quality_score',
    sourceGenerationId: 'source_generation_id',
    curatedBy: 'curated_by',
    isActive: 'is_active',
    metadata: 'metadata',
    createdAt: 'created_at',
  },
  aiGenerations: {
    id: 'id',
    taskType: 'task_type',
    qualityScore: 'quality_score',
    thumbs: 'thumbs',
    userFeedback: 'user_feedback',
    promptHash: 'prompt_hash',
    responseHash: 'response_hash',
    model: 'model',
    latencyMs: 'latency_ms',
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  desc: (a: unknown) => [a, 'desc'],
  gte: (a: unknown, b: unknown) => [a, '>=', b],
  isNotNull: (a: unknown) => [a, 'is not null'],
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));

import { handleFewShotRoutes } from '../src/routes/few-shot.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('handleFewShotRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // GET /api/few-shot — missing taskType
  it('GET /api/few-shot returns 400 when taskType is missing', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleFewShotRoutes(req, res, '/api/few-shot', createBodyParser({}));

    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('taskType');
  });

  // GET /api/few-shot?taskType=... — success
  it('GET /api/few-shot?taskType=summarize returns active examples', async () => {
    const mockRows = [
      { id: '1', taskType: 'summarize', inputText: 'input-1', outputText: 'output-1', qualityScore: '0.95', isActive: true },
      { id: '2', taskType: 'summarize', inputText: 'input-2', outputText: 'output-2', qualityScore: '0.90', isActive: true },
    ];
    const chainable = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockRows),
    };
    mockSelect.mockReturnValue(chainable);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleFewShotRoutes(req, res, '/api/few-shot?taskType=summarize', createBodyParser({}));

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(2);
  });

  // POST /api/few-shot — missing required fields
  it('POST /api/few-shot returns 400 when missing required fields', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFewShotRoutes(
      req, res, '/api/few-shot',
      createBodyParser({ taskType: 'summarize', inputText: 'some input' }),
    );

    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  // POST /api/few-shot — create example
  it('POST /api/few-shot creates example and returns 201', async () => {
    const created = {
      id: 'uuid-1',
      taskType: 'summarize',
      inputText: 'Long article text...',
      outputText: 'Concise summary...',
      qualityScore: '1.00',
      curatedBy: 'manual',
      isActive: true,
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([created]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFewShotRoutes(
      req, res, '/api/few-shot',
      createBodyParser({ taskType: 'summarize', inputText: 'Long article text...', outputText: 'Concise summary...' }),
    );

    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.taskType).toBe('summarize');
    expect(body.curatedBy).toBe('manual');
  });

  // POST /api/few-shot/build — missing taskType
  it('POST /api/few-shot/build returns 400 when taskType is missing', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFewShotRoutes(req, res, '/api/few-shot/build', createBodyParser({}));

    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('taskType');
  });

  // POST /api/few-shot/build — auto-curates from top generations
  it('POST /api/few-shot/build auto-curates from top-scoring generations', async () => {
    const candidates = [
      {
        id: 'gen-1',
        taskType: 'summarize',
        promptHash: 'ph-1',
        responseHash: 'rh-1',
        qualityScore: '0.95',
        thumbs: 1,
        model: 'gpt-4',
        latencyMs: 800,
      },
    ];

    let selectCallCount = 0;
    mockSelect.mockImplementation((...args: unknown[]) => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call: select candidates from aiGenerations
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(candidates),
        };
      }
      // Subsequent calls: check if already curated — return empty (not curated)
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
    });

    // Mock: insert for new few-shot example
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFewShotRoutes(
      req, res, '/api/few-shot/build',
      createBodyParser({ taskType: 'summarize' }),
    );

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.taskType).toBe('summarize');
    expect(body.candidatesFound).toBe(1);
    expect(body.added).toBe(1);
  });

  // DELETE /api/few-shot/:id — success (soft-delete)
  it('DELETE /api/few-shot/:id soft-deletes by setting isActive=false', async () => {
    const updated = { id: 'uuid-1', isActive: false };
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });

    const req = createMockReq('DELETE');
    const res = createMockRes();
    await handleFewShotRoutes(req, res, '/api/few-shot/uuid-1', createBodyParser({}));

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.deactivated).toBe('uuid-1');
  });

  // DELETE /api/few-shot/:id — not found
  it('DELETE /api/few-shot/:id returns 404 for missing example', async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createMockReq('DELETE');
    const res = createMockRes();
    await handleFewShotRoutes(req, res, '/api/few-shot/nonexistent', createBodyParser({}));

    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('not found');
  });
});
