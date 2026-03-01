/**
 * Tests for cost observability routes (routes/costs.ts)
 *
 * Mocks @playbook/shared-llm for costLedger.
 * NOTE: handleCostRoutes is synchronous and does not use db or parseBody.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── shared-llm mock ─────────────────────────────────────────────────────────
const mockGetObservabilityReport = vi.fn();
const mockGetReport = vi.fn();
const mockReset = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  costLedger: {
    getObservabilityReport: (...args: unknown[]) => mockGetObservabilityReport(...args),
    getReport: (...args: unknown[]) => mockGetReport(...args),
    reset: (...args: unknown[]) => mockReset(...args),
  },
}));

import { handleCostRoutes } from '../src/routes/costs.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createMockReq(method: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method, headers } as IncomingMessage;
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

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('handleCostRoutes', () => {
  const originalEnv = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = 'test-admin-key';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_API_KEY = originalEnv;
    } else {
      delete process.env.ADMIN_API_KEY;
    }
  });

  // GET /api/costs — success
  it('GET /api/costs returns cost observability report', () => {
    const report = {
      totalCostUsd: 12.34,
      callCount: 150,
      modelBreakdown: { 'gpt-4': 10.00, 'claude-3': 2.34 },
    };
    mockGetObservabilityReport.mockReturnValue(report);

    const req = createMockReq('GET');
    const res = createMockRes();
    handleCostRoutes(req, res, '/api/costs');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.totalCostUsd).toBe(12.34);
    expect(body.callCount).toBe(150);
    expect(mockGetObservabilityReport).toHaveBeenCalledOnce();
  });

  // POST /api/costs/reset — auth enforced by middleware, route just resets
  it('POST /api/costs/reset resets costs', () => {
    const postResetReport = { totalCostUsd: 0, callCount: 0, modelBreakdown: {} };
    mockGetReport.mockReturnValue(postResetReport);

    const req = createMockReq('POST');
    const res = createMockRes();
    handleCostRoutes(req, res, '/api/costs/reset');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.status).toBe('reset');
    expect(mockReset).toHaveBeenCalledOnce();
    expect(mockGetReport).toHaveBeenCalledOnce();
  });

  // Unmatched route
  it('returns 404 for unmatched routes', () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    handleCostRoutes(req, res, '/api/costs/unknown');

    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('Not found');
  });
});
