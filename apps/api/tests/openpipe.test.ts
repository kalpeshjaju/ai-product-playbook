/**
 * Tests for OpenPipe API routes (routes/openpipe.ts)
 *
 * Mocks shared-llm openpipe functions to test route handler logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const mockLogTrainingData = vi.fn();
const mockTriggerFineTune = vi.fn();
const mockGetFineTuneStatus = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  logTrainingData: (...args: unknown[]) => mockLogTrainingData(...args),
  triggerFineTune: (...args: unknown[]) => mockTriggerFineTune(...args),
  getFineTuneStatus: (...args: unknown[]) => mockGetFineTuneStatus(...args),
}));

import { handleOpenPipeRoutes } from '../src/routes/openpipe.js';

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

describe('handleOpenPipeRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENPIPE_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns disabled message when API key not set', async () => {
    vi.stubEnv('OPENPIPE_API_KEY', '');
    delete process.env.OPENPIPE_API_KEY;

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/log', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.enabled).toBe(false);
  });

  it('returns 503 in strict mode when API key not set', async () => {
    vi.stubEnv('OPENPIPE_API_KEY', '');
    vi.stubEnv('STRATEGY_PROVIDER_MODE', 'strict');
    delete process.env.OPENPIPE_API_KEY;

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/log', createBodyParser({}));
    expect(res._statusCode).toBe(503);
    expect(res._body).toContain('strict mode');
  });

  it('POST /api/openpipe/log validates messages required', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/log', createBodyParser({}));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('messages');
  });

  it('POST /api/openpipe/log logs training data', async () => {
    mockLogTrainingData.mockResolvedValue(undefined);

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/log', createBodyParser({
      messages: [{ role: 'user', content: 'Hello' }],
    }));
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.logged).toBe(true);
  });

  it('POST /api/openpipe/finetune validates baseModel required', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/finetune', createBodyParser({}));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('baseModel');
  });

  it('POST /api/openpipe/finetune triggers fine-tune job', async () => {
    mockTriggerFineTune.mockResolvedValue('ft-123');

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/finetune', createBodyParser({
      baseModel: 'gpt-4o-mini',
    }));
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.jobId).toBe('ft-123');
  });

  it('POST /api/openpipe/finetune returns 500 when job creation fails', async () => {
    mockTriggerFineTune.mockResolvedValue(null);

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/finetune', createBodyParser({
      baseModel: 'gpt-4o-mini',
    }));
    expect(res._statusCode).toBe(500);
  });

  it('GET /api/openpipe/finetune/:jobId returns status', async () => {
    mockGetFineTuneStatus.mockResolvedValue({
      id: 'ft-123',
      status: 'completed',
      baseModel: 'gpt-4o-mini',
    });

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/finetune/ft-123', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.status).toBe('completed');
  });

  it('GET /api/openpipe/finetune/:jobId returns 404 when not found', async () => {
    mockGetFineTuneStatus.mockResolvedValue(null);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/finetune/ft-nonexistent', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });

  it('returns 404 for unmatched routes', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleOpenPipeRoutes(req, res, '/api/openpipe/unknown', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });
});
