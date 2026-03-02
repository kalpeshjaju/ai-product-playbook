/**
 * Tests for Composio API routes (routes/composio.ts)
 *
 * Mocks shared-llm composio functions to test route handler logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const mockGetAvailableActions = vi.fn();
const mockExecuteAction = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  getAvailableActions: (...args: unknown[]) => mockGetAvailableActions(...args),
  executeAction: (...args: unknown[]) => mockExecuteAction(...args),
  scanOutput: vi.fn().mockResolvedValue({ passed: true, findings: [], scanTimeMs: 0, scannersRun: ['regex'] }),
}));

import { handleComposioRoutes } from '../src/routes/composio.js';
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

describe('handleComposioRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('COMPOSIO_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns disabled message when API key not set', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    delete process.env.COMPOSIO_API_KEY;

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/actions', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.enabled).toBe(false);
  });

  it('returns 503 in strict mode when API key not set', async () => {
    vi.stubEnv('COMPOSIO_API_KEY', '');
    vi.stubEnv('STRATEGY_PROVIDER_MODE', 'strict');
    delete process.env.COMPOSIO_API_KEY;

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/actions', createBodyParser({}));
    expect(res._statusCode).toBe(503);
    expect(res._body).toContain('strict mode');
  });

  it('GET /api/composio/actions returns actions list', async () => {
    mockGetAvailableActions.mockResolvedValue([
      { name: 'SLACK_SEND', description: 'Send slack msg', appName: 'slack', parameters: {}, requiresAuth: true },
    ]);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/actions', createBodyParser({}));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as unknown[];
    expect(body).toHaveLength(1);
  });

  it('GET /api/composio/actions?app=slack filters by app', async () => {
    mockGetAvailableActions.mockResolvedValue([]);

    const req = createMockReq('GET');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/actions?app=slack', createBodyParser({}));
    expect(mockGetAvailableActions).toHaveBeenCalledWith('slack');
  });

  it('POST /api/composio/execute validates required fields', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/execute', createBodyParser({ action: 'SLACK_SEND' }));
    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Required');
  });

  it('POST /api/composio/execute executes action', async () => {
    mockExecuteAction.mockResolvedValue({
      success: true,
      data: { messageId: '123' },
      metadata: { actionName: 'SLACK_SEND', executionTimeMs: 50, noop: false },
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/execute', createBodyParser({
      action: 'SLACK_SEND',
      params: { text: 'Hello' },
    }));
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.success).toBe(true);
  });

  it('returns 404 for unmatched routes', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/unknown', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });

  // ── Guardrail 422 blocks ─────────────────────────────────────────────────

  it('POST /api/composio/execute returns 422 when guardrail blocks result', async () => {
    mockExecuteAction.mockResolvedValue({
      success: true,
      data: { sensitiveContent: 'blocked' },
      metadata: { actionName: 'SLACK_SEND', executionTimeMs: 50, noop: false },
    });
    vi.mocked(scanOutput).mockResolvedValueOnce({
      passed: false,
      findings: [{ scanner: 'regex', category: 'pii_leakage', description: 'PII found in action result', severity: 'high' }],
      scanTimeMs: 1,
      scannersRun: ['regex'],
    });

    const req = createMockReq('POST');
    const res = createMockRes();
    await handleComposioRoutes(req, res, '/api/composio/execute', createBodyParser({
      action: 'SLACK_SEND',
      params: { text: 'Hello' },
    }));
    expect(res._statusCode).toBe(422);
    expect(res._body).toContain('blocked by output guardrail');
  });
});
