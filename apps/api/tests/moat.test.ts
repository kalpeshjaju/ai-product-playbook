/**
 * Tests for moat health dashboard route (routes/moat.ts)
 *
 * Mocks the Drizzle db to test route handler logic without a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Mock the db module
const mockSelect = vi.fn();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    execute: vi.fn().mockResolvedValue([]),
  },
  aiGenerations: {
    id: 'id',
    createdAt: 'created_at',
    userId: 'user_id',
    userFeedback: 'user_feedback',
    thumbs: 'thumbs',
    qualityScore: 'quality_score',
    hallucination: 'hallucination',
  },
  outcomes: {
    id: 'id',
    generationId: 'generation_id',
    userId: 'user_id',
    outcomeType: 'outcome_type',
    outcomeValue: 'outcome_value',
    createdAt: 'created_at',
  },
  fewShotBank: {
    id: 'id',
    taskType: 'task_type',
    curatedBy: 'curated_by',
    isActive: 'is_active',
    qualityScore: 'quality_score',
  },
  promptVersions: {
    id: 'id',
    promptName: 'prompt_name',
    version: 'version',
    evalScore: 'eval_score',
    activePct: 'active_pct',
  },
}));

vi.mock('../src/db/schema.js', () => ({
  aiGenerations: { id: 'id', createdAt: 'created_at', userFeedback: 'user_feedback', thumbs: 'thumbs', qualityScore: 'quality_score', hallucination: 'hallucination' },
  outcomes: { id: 'id', generationId: 'generation_id', outcomeType: 'outcome_type' },
  fewShotBank: { id: 'id', taskType: 'task_type', curatedBy: 'curated_by', isActive: 'is_active' },
  promptVersions: { id: 'id', promptName: 'prompt_name', version: 'version', evalScore: 'eval_score', activePct: 'active_pct' },
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

import { handleMoatRoutes } from '../src/routes/moat.js';

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

/**
 * Creates a thenable chain mock — every method returns the chain itself,
 * and awaiting the chain resolves to the given value.
 * This mirrors Drizzle's query builder which is both chainable and thenable.
 */
function thenableChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  const thenFn = (onFulfilled?: (v: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(onFulfilled);

  for (const method of ['from', 'where', 'groupBy', 'orderBy', 'limit', 'offset']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = thenFn;
  return chain;
}

/** Sets up all 5 queries to return given data (or sensible defaults). */
function setupAllQueries(overrides: {
  velocity?: unknown;
  quality?: unknown;
  fewShot?: unknown;
  funnel?: unknown;
  prompts?: unknown;
} = {}) {
  const velocityData = overrides.velocity ?? [{ total: 100, perDay: 14.3, feedbackRate: 45.0 }];
  const qualityData = overrides.quality ?? [{ avgQuality: '0.82', hallucinationRate: 5.2, thumbsUp: 80, thumbsDown: 12 }];
  const fewShotData = overrides.fewShot ?? [{ taskType: 'classification', active: 10, auto: 7, manual: 3 }];
  const funnelData = overrides.funnel ?? [{ totalGenerations: 100, withFeedback: 45, conversions: 20, abandoned: 5 }];
  const promptData = overrides.prompts ?? [{ promptName: 'job-classifier', version: 'v1.2.0', evalScore: '0.85', activePct: 100 }];

  let callIndex = 0;
  mockSelect.mockImplementation(() => {
    const idx = callIndex++;
    if (idx === 0) return thenableChain(velocityData);   // velocity
    if (idx === 1) return thenableChain(qualityData);    // quality
    if (idx === 2) return thenableChain(fewShotData);    // few-shot
    if (idx === 3) return thenableChain(funnelData);     // funnel
    return thenableChain(promptData);                    // prompts
  });
}

describe('handleMoatRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Happy path — complete health data ──────────────────────────────
  it('GET /api/moat-health returns complete health data', async () => {
    setupAllQueries();

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body).toHaveProperty('flywheelVelocity');
    expect(body).toHaveProperty('quality');
    expect(body).toHaveProperty('fewShotCoverage');
    expect(body).toHaveProperty('outcomeFunnel');
    expect(body).toHaveProperty('promptHealth');

    const fv = body.flywheelVelocity as Record<string, number>;
    expect(fv.totalGenerations).toBe(100);
    expect(fv.generationsPerDay).toBe(14.3);
    expect(fv.feedbackRatePct).toBe(45.0);
  });

  // ── 2. Empty tables — all zeros/nulls ─────────────────────────────────
  it('returns zeros/nulls when all tables are empty', async () => {
    setupAllQueries({
      velocity: [{ total: 0, perDay: 0, feedbackRate: 0 }],
      quality: [{ avgQuality: null, hallucinationRate: 0, thumbsUp: 0, thumbsDown: 0 }],
      fewShot: [],
      funnel: [{ totalGenerations: 0, withFeedback: 0, conversions: 0, abandoned: 0 }],
      prompts: [],
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    const quality = body.quality as Record<string, unknown>;
    expect(quality.avgQualityScore).toBeNull();
    expect(quality.thumbsUp).toBe(0);
    expect(quality.thumbsDown).toBe(0);

    const fsc = body.fewShotCoverage as unknown[];
    expect(fsc).toHaveLength(0);
  });

  // ── 3. Thumbs ratio computation ───────────────────────────────────────
  it('computes thumbs up and down counts correctly', async () => {
    setupAllQueries({
      quality: [{ avgQuality: '0.90', hallucinationRate: 2.0, thumbsUp: 150, thumbsDown: 25 }],
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    const quality = body.quality as Record<string, number>;
    expect(quality.thumbsUp).toBe(150);
    expect(quality.thumbsDown).toBe(25);
  });

  // ── 4. Few-shot groupBy per task type ─────────────────────────────────
  it('groups few-shot coverage by task type', async () => {
    const fewShotData = [
      { taskType: 'classification', active: 10, auto: 7, manual: 3 },
      { taskType: 'summarization', active: 5, auto: 5, manual: 0 },
    ];
    setupAllQueries({ fewShot: fewShotData });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    const coverage = body.fewShotCoverage as Array<{ taskType: string; active: number }>;
    expect(coverage).toHaveLength(2);
    expect(coverage[0].taskType).toBe('classification');
    expect(coverage[1].taskType).toBe('summarization');
  });

  // ── 5. Only active prompts returned (activePct > 0) ───────────────────
  it('only returns prompts with activePct > 0', async () => {
    const promptData = [
      { promptName: 'job-classifier', version: 'v1.2.0', evalScore: '0.85', activePct: 50 },
      { promptName: 'summarizer', version: 'v2.0.0', evalScore: '0.90', activePct: 50 },
    ];
    setupAllQueries({ prompts: promptData });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    const prompts = body.promptHealth as Array<{ activePct: number }>;
    expect(prompts).toHaveLength(2);
    expect(prompts.every((p) => p.activePct > 0)).toBe(true);
  });

  // ── 6. DB error → 500 ────────────────────────────────────────────────
  it('returns 500 when database query fails', async () => {
    mockSelect.mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(500);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.error).toBe('Internal server error');
  });

  // ── 7. POST → 404 ────────────────────────────────────────────────────
  it('returns 404 for POST method', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-health');

    expect(res._statusCode).toBe(404);
  });

  // ── 8. Wrong path → 404 ──────────────────────────────────────────────
  it('returns 404 for wrong path', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleMoatRoutes(req, res, '/api/moat-wrong');

    expect(res._statusCode).toBe(404);
  });
});
