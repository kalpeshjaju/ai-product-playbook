/**
 * Tests for preference routes (routes/preferences.ts)
 *
 * Mocks the Drizzle db to test route handler logic without a real database.
 * Mocks @playbook/shared-llm for inferPreferences.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── DB mocks ────────────────────────────────────────────────────────────────
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
  },
  userPreferences: {
    id: 'id',
    userId: 'user_id',
    preferenceKey: 'preference_key',
    preferenceValue: 'preference_value',
    source: 'source',
    confidence: 'confidence',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  aiGenerations: {
    id: 'id',
    userId: 'user_id',
    userFeedback: 'user_feedback',
    thumbs: 'thumbs',
    model: 'model',
    taskType: 'task_type',
    latencyMs: 'latency_ms',
    qualityScore: 'quality_score',
    userEditDiff: 'user_edit_diff',
    createdAt: 'created_at',
  },
}));

vi.mock('../src/db/schema.js', () => ({
  userPreferences: {
    id: 'id',
    userId: 'user_id',
    preferenceKey: 'preference_key',
    preferenceValue: 'preference_value',
    source: 'source',
    confidence: 'confidence',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  aiGenerations: {
    id: 'id',
    userId: 'user_id',
    userFeedback: 'user_feedback',
    thumbs: 'thumbs',
    model: 'model',
    taskType: 'task_type',
    latencyMs: 'latency_ms',
    qualityScore: 'quality_score',
    userEditDiff: 'user_edit_diff',
    createdAt: 'created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  desc: (a: unknown) => [a, 'desc'],
  isNotNull: (a: unknown) => [a, 'is not null'],
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));

// ─── shared-llm mock ─────────────────────────────────────────────────────────
const mockInferPreferences = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  inferPreferences: (...args: unknown[]) => mockInferPreferences(...args),
}));

import { handlePreferenceRoutes } from '../src/routes/preferences.js';

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
describe('handlePreferenceRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // GET /api/preferences/:userId
  it('GET /api/preferences/:userId returns all preferences', async () => {
    const mockRows = [
      { id: '1', userId: 'user-1', preferenceKey: 'tone', preferenceValue: 'formal', source: 'explicit' },
      { id: '2', userId: 'user-1', preferenceKey: 'verbosity', preferenceValue: 'concise', source: 'inferred' },
    ];
    const chainable = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(mockRows),
    };
    mockSelect.mockReturnValue(chainable);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handlePreferenceRoutes(req, res, '/api/preferences/user-1', createBodyParser({}));

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(2);
  });

  // POST /api/preferences/:userId — validation
  it('POST /api/preferences/:userId returns 400 when missing required fields', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handlePreferenceRoutes(req, res, '/api/preferences/user-1', createBodyParser({ preferenceKey: 'tone' }));

    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  // POST /api/preferences/:userId — create new
  it('POST /api/preferences/:userId creates new preference and returns 201', async () => {
    // Mock: select for upsert check returns empty (no existing)
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const created = {
      id: 'uuid-1',
      userId: 'user-1',
      preferenceKey: 'tone',
      preferenceValue: 'formal',
      source: 'explicit',
      confidence: '1.00',
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([created]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handlePreferenceRoutes(
      req, res, '/api/preferences/user-1',
      createBodyParser({ preferenceKey: 'tone', preferenceValue: 'formal' }),
    );

    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.preferenceKey).toBe('tone');
    expect(body.source).toBe('explicit');
  });

  // POST /api/preferences/:userId — upsert (update existing)
  it('POST /api/preferences/:userId upserts when preference already exists', async () => {
    const existing = {
      id: 'uuid-1',
      userId: 'user-1',
      preferenceKey: 'tone',
      preferenceValue: 'casual',
      source: 'explicit',
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
    };
    mockSelect.mockReturnValue(selectChain);

    const updated = { ...existing, preferenceValue: 'formal', confidence: '1.00' };
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handlePreferenceRoutes(
      req, res, '/api/preferences/user-1',
      createBodyParser({ preferenceKey: 'tone', preferenceValue: 'formal' }),
    );

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.preferenceValue).toBe('formal');
  });

  // PATCH /api/preferences/:userId/:key — validation
  it('PATCH /api/preferences/:userId/:key returns 400 when preferenceValue is missing', async () => {
    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handlePreferenceRoutes(req, res, '/api/preferences/user-1/tone', createBodyParser({}));

    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('preferenceValue');
  });

  // PATCH /api/preferences/:userId/:key — success
  it('PATCH /api/preferences/:userId/:key updates value and returns 200', async () => {
    const updated = {
      id: 'uuid-1',
      userId: 'user-1',
      preferenceKey: 'tone',
      preferenceValue: 'professional',
    };
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });

    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handlePreferenceRoutes(
      req, res, '/api/preferences/user-1/tone',
      createBodyParser({ preferenceValue: 'professional' }),
    );

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.preferenceValue).toBe('professional');
  });

  // PATCH /api/preferences/:userId/:key — not found
  it('PATCH /api/preferences/:userId/:key returns 404 when not found', async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handlePreferenceRoutes(
      req, res, '/api/preferences/user-1/unknown-key',
      createBodyParser({ preferenceValue: 'anything' }),
    );

    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('not found');
  });

  // DELETE /api/preferences/:userId/:key — success
  it('DELETE /api/preferences/:userId/:key deletes preference and returns 200', async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'uuid-1', preferenceKey: 'tone' }]),
      }),
    });

    const req = createMockReq('DELETE');
    const res = createMockRes();
    await handlePreferenceRoutes(req, res, '/api/preferences/user-1/tone', createBodyParser({}));

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.deleted).toBe('tone');
  });

  // DELETE /api/preferences/:userId/:key — not found
  it('DELETE /api/preferences/:userId/:key returns 404 when not found', async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });

    const req = createMockReq('DELETE');
    const res = createMockRes();
    await handlePreferenceRoutes(req, res, '/api/preferences/user-1/missing-key', createBodyParser({}));

    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('not found');
  });

  // POST /api/preferences/:userId/infer
  it('POST /api/preferences/:userId/infer triggers inference from feedback', async () => {
    // Mock: select generations with feedback
    const generationRows = [
      {
        userFeedback: 'accepted',
        thumbs: 1,
        model: 'gpt-4',
        taskType: 'summarize',
        latencyMs: 1200,
        qualityScore: '0.92',
        userEditDiff: null,
      },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(generationRows),
    };
    mockSelect.mockReturnValue(selectChain);

    // Mock: inferPreferences returns inferred preferences
    const inferred = [
      { preferenceKey: 'preferred_model', preferenceValue: 'gpt-4', confidence: 0.87 },
    ];
    mockInferPreferences.mockReturnValue(inferred);

    // Mock: upsert check — no existing preference
    // After initial select for generations, subsequent selects for upsert check
    // need separate chaining. We handle by returning empty on subsequent calls.
    let selectCallCount = 0;
    mockSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First call: select generations with feedback
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(generationRows),
        };
      }
      // Subsequent calls: upsert check — no existing
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
    });

    // Mock: insert for upsert (no existing, so insert)
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handlePreferenceRoutes(req, res, '/api/preferences/user-1/infer', createBodyParser({}));

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.inferred).toBe(1);
    expect(mockInferPreferences).toHaveBeenCalledOnce();
  });
});
