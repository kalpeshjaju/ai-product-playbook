/**
 * Tests for feedback routes (routes/feedback.ts)
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
  aiGenerations: {
    id: 'id',
    createdAt: 'created_at',
    userId: 'user_id',
    sessionId: 'session_id',
    promptHash: 'prompt_hash',
    promptVersion: 'prompt_version',
    taskType: 'task_type',
    inputTokens: 'input_tokens',
    responseHash: 'response_hash',
    outputTokens: 'output_tokens',
    model: 'model',
    modelVersion: 'model_version',
    latencyMs: 'latency_ms',
    costUsd: 'cost_usd',
    userFeedback: 'user_feedback',
    feedbackAt: 'feedback_at',
    thumbs: 'thumbs',
    userEditDiff: 'user_edit_diff',
    qualityScore: 'quality_score',
    hallucination: 'hallucination',
    guardrailTriggered: 'guardrail_triggered',
  },
  outcomes: {
    id: 'id',
    generationId: 'generation_id',
    userId: 'user_id',
    outcomeType: 'outcome_type',
    outcomeValue: 'outcome_value',
    createdAt: 'created_at',
  },
}));

vi.mock('../src/db/schema.js', () => ({
  aiGenerations: {
    id: 'id',
    createdAt: 'created_at',
    userId: 'user_id',
    sessionId: 'session_id',
    promptHash: 'prompt_hash',
    promptVersion: 'prompt_version',
    taskType: 'task_type',
    inputTokens: 'input_tokens',
    responseHash: 'response_hash',
    outputTokens: 'output_tokens',
    model: 'model',
    modelVersion: 'model_version',
    latencyMs: 'latency_ms',
    costUsd: 'cost_usd',
    userFeedback: 'user_feedback',
    feedbackAt: 'feedback_at',
    thumbs: 'thumbs',
    userEditDiff: 'user_edit_diff',
    qualityScore: 'quality_score',
    hallucination: 'hallucination',
    guardrailTriggered: 'guardrail_triggered',
  },
  outcomes: {
    id: 'id',
    generationId: 'generation_id',
    userId: 'user_id',
    outcomeType: 'outcome_type',
    outcomeValue: 'outcome_value',
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

import { handleFeedbackRoutes } from '../src/routes/feedback.js';
import type { AuthResult } from '../src/middleware/auth.js';

const TEST_USER_ID = 'test-user-1';

function createMockAuthResult(userId = TEST_USER_ID): AuthResult {
  return {
    userContext: { userId, source: 'api_key' },
    tier: 'user',
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

describe('handleFeedbackRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── PATCH /api/feedback/:id ──────────────────────────────────────────────

  it('PATCH /api/feedback/:id returns 400 when no feedback fields are provided', async () => {
    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1',
      createBodyParser({}),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Provide at least one of');
  });

  it('PATCH /api/feedback/:id returns 400 for invalid userFeedback value', async () => {
    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1',
      createBodyParser({ userFeedback: 'invalid_value' }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Invalid userFeedback');
  });

  it('PATCH /api/feedback/:id returns 400 for invalid thumbs value', async () => {
    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1',
      createBodyParser({ thumbs: 5 }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('thumbs must be -1, 0, or 1');
  });

  it('PATCH /api/feedback/:id updates feedback and returns 200', async () => {
    // Mock: ownership check — generation belongs to authenticated user
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'gen-uuid-1', userId: TEST_USER_ID }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const updatedRow = {
      id: 'gen-uuid-1',
      userFeedback: 'accepted',
      thumbs: 1,
      feedbackAt: new Date().toISOString(),
    };
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedRow]),
        }),
      }),
    });

    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1',
      createBodyParser({ userFeedback: 'accepted', thumbs: 1 }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.userFeedback).toBe('accepted');
    expect(body.thumbs).toBe(1);
  });

  it('PATCH /api/feedback/:id returns 404 when generation is not found', async () => {
    // Mock: ownership check — generation not found
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/nonexistent-id',
      createBodyParser({ thumbs: -1 }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('Generation not found');
  });

  it('PATCH /api/feedback/:id returns 403 when generation belongs to another user', async () => {
    // Mock: generation exists but belongs to a different user
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'gen-uuid-1', userId: 'other-user' }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('PATCH');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1',
      createBodyParser({ thumbs: 1 }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(403);
    expect(res._body).toContain('Forbidden');
  });

  // ── POST /api/feedback/:id/outcome ───────────────────────────────────────

  it('POST /api/feedback/:id/outcome returns 400 when outcomeType is missing', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1/outcome',
      createBodyParser({}),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required: outcomeType');
  });

  it('POST /api/feedback/:id/outcome returns 400 for invalid outcomeType', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1/outcome',
      createBodyParser({ outcomeType: 'bogus_type' }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Invalid outcomeType');
  });

  it('POST /api/feedback/:id/outcome returns 404 when generation is not found', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/nonexistent-id/outcome',
      createBodyParser({ outcomeType: 'conversion' }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('Generation not found');
  });

  it('POST /api/feedback/:id/outcome returns 403 when generation belongs to another user', async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'gen-uuid-1', userId: 'other-user' }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1/outcome',
      createBodyParser({ outcomeType: 'conversion' }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(403);
    expect(res._body).toContain('Forbidden');
  });

  it('POST /api/feedback/:id/outcome creates outcome with auth userId and returns 201', async () => {
    // Mock: generation exists and belongs to authenticated user
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'gen-uuid-1', userId: TEST_USER_ID }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const createdOutcome = {
      id: 'outcome-uuid-1',
      generationId: 'gen-uuid-1',
      userId: TEST_USER_ID,
      outcomeType: 'conversion',
      outcomeValue: null,
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdOutcome]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleFeedbackRoutes(
      req, res, '/api/feedback/gen-uuid-1/outcome',
      createBodyParser({ outcomeType: 'conversion' }),
      createMockAuthResult(),
    );
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.id).toBe('outcome-uuid-1');
    expect(body.userId).toBe(TEST_USER_ID);
    expect(body.outcomeType).toBe('conversion');
  });

  // ── 404 fallthrough ──────────────────────────────────────────────────────

  it('returns 404 for unmatched feedback routes', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleFeedbackRoutes(req, res, '/api/feedback', createBodyParser({}), createMockAuthResult());
    expect(res._statusCode).toBe(404);
  });
});
