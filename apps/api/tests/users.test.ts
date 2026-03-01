/**
 * Tests for users route (routes/users.ts)
 *
 * Mocks @clerk/backend to test fail-open and Clerk user mapping without real Clerk.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const mockGetUserList = vi.fn();

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn().mockImplementation(() => ({
    users: {
      getUserList: (opts: { limit: number }) => mockGetUserList(opts),
    },
  })),
}));

import { handleUserRoutes } from '../src/routes/users.js';

function createMockReq(method: string): IncomingMessage {
  return { method } as IncomingMessage;
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

describe('handleUserRoutes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET /api/users', () => {
    it('returns empty array when CLERK_SECRET_KEY is not set (fail-open)', async () => {
      delete process.env.CLERK_SECRET_KEY;

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleUserRoutes(req, res, '/api/users');

      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual([]);
      expect(mockGetUserList).not.toHaveBeenCalled();
    });

    it('returns mapped users when Clerk is configured', async () => {
      process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
      mockGetUserList.mockResolvedValue({
        data: [
          {
            id: 'user_1',
            firstName: 'Jane',
            lastName: 'Doe',
            username: 'jane',
            emailAddresses: [{ emailAddress: 'jane@example.com' }],
            publicMetadata: { role: 'owner' },
          },
          {
            id: 'user_2',
            firstName: null,
            lastName: null,
            username: 'bob',
            emailAddresses: [],
            publicMetadata: {},
          },
        ],
      });

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleUserRoutes(req, res, '/api/users');

      expect(res._statusCode).toBe(200);
      const users = JSON.parse(res._body);
      expect(users).toHaveLength(2);
      expect(users[0]).toEqual({
        id: 'user_1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'owner',
      });
      expect(users[1]).toEqual({
        id: 'user_2',
        name: 'bob',
        email: '',
        role: 'viewer',
      });
      expect(mockGetUserList).toHaveBeenCalledWith({ limit: 100 });
    });
  });

  it('returns 404 for non-GET or wrong path', async () => {
    const req = createMockReq('POST');
    const res = createMockRes();
    await handleUserRoutes(req, res, '/api/users');
    expect(res._statusCode).toBe(404);
  });
});
