/**
 * Tests for AI generation logging routes (routes/generations.ts)
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
  createGenerationLog: vi.fn().mockImplementation((input: Record<string, unknown>) => ({
    ...input,
    id: 'gen-uuid',
    promptHash: 'hashed-prompt',
    responseHash: 'hashed-response',
  })),
}));

import { handleGenerationRoutes } from '../src/routes/generations.js';
import type { AuthResult } from '../src/middleware/auth.js';

/** Default auth result for tests (authenticated via api-key). */
function createMockAuth(userId = 'user-1'): AuthResult {
  return {
    userContext: { userId, source: 'api_key' },
    tier: 'user',
    authMethod: 'api-key',
  };
}

/** Helper: builds a complete valid generation body with all required fields. */
function validGenerationBody(): Record<string, unknown> {
  return {
    userId: 'user-1',
    promptText: 'Summarize this document',
    promptVersion: 'v1.0.0',
    taskType: 'summarization',
    inputTokens: 500,
    responseText: 'Here is the summary...',
    outputTokens: 150,
    model: 'gpt-4o',
    modelVersion: '2024-05-13',
    latencyMs: 1200,
    costUsd: 0.003,
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

describe('handleGenerationRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/generations ────────────────────────────────────────────────

  it('POST /api/generations returns 400 when required fields are missing', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleGenerationRoutes(
      req, res, '/api/generations',
      createBodyParser({ userId: 'user-1', promptText: 'hello' }),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required field missing');
  });

  it('POST /api/generations returns 400 when a single required field is missing', async () => {
    const body = validGenerationBody();
    delete body.model;

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleGenerationRoutes(req, res, '/api/generations', createBodyParser(body), createMockAuth());
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('model');
  });

  it('POST /api/generations creates generation log and returns 201', async () => {
    const createdRow = {
      id: 'gen-uuid',
      userId: 'user-1',
      model: 'gpt-4o',
      taskType: 'summarization',
    };
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdRow]),
      }),
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleGenerationRoutes(
      req, res, '/api/generations',
      createBodyParser(validGenerationBody()),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.id).toBe('gen-uuid');
  });

  // ── GET /api/generations ─────────────────────────────────────────────────

  it('GET /api/generations returns 400 when userId is missing', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleGenerationRoutes(req, res, '/api/generations', createBodyParser({}), createMockAuth());
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('userId');
  });

  it('GET /api/generations returns paginated results', async () => {
    const mockRows = [
      { id: 'gen-1', userId: 'user-1', taskType: 'summarization' },
      { id: 'gen-2', userId: 'user-1', taskType: 'extraction' },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(mockRows),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleGenerationRoutes(
      req, res, '/api/generations?userId=user-1&limit=10&offset=0',
      createBodyParser({}),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(2);
  });

  // ── GET /api/generations/stats ───────────────────────────────────────────

  it('GET /api/generations/stats returns 400 when userId is missing', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleGenerationRoutes(req, res, '/api/generations/stats', createBodyParser({}), createMockAuth());
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('userId');
  });

  it('GET /api/generations/stats returns aggregated stats', async () => {
    const mockStats = {
      totalCalls: 42,
      avgLatencyMs: 800,
      avgQualityScore: '0.87',
      totalCostUsd: '1.234',
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([mockStats]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleGenerationRoutes(
      req, res, '/api/generations/stats?userId=user-1&days=7',
      createBodyParser({}),
      createMockAuth(),
    );
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.totalCalls).toBe(42);
    expect(body.avgLatencyMs).toBe(800);
    expect(body.avgQualityScore).toBe(0.87);
    expect(body.totalCostUsd).toBe(1.234);
  });

  // ── 404 fallthrough ──────────────────────────────────────────────────────

  it('returns 404 for unmatched generation routes', async () => {
    const req = createMockReq('DELETE');
    const res = createMockRes();
    await handleGenerationRoutes(req, res, '/api/generations', createBodyParser({}), createMockAuth());
    expect(res._statusCode).toBe(404);
  });
});
