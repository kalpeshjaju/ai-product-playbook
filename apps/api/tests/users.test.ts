/**
 * Tests for users route (routes/users.ts)
 *
 * Mocks @clerk/backend to test fail-open and Clerk user mapping without real Clerk.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockReq, createMockRes } from './helpers.js';

const mockGetUserList = vi.fn();

vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn().mockImplementation(() => ({
    users: {
      getUserList: (opts: { limit: number }) => mockGetUserList(opts),
    },
  })),
}));

import { handleUserRoutes } from '../src/routes/users.js';

describe('handleUserRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('GET /api/users', () => {
    it('returns empty array when CLERK_SECRET_KEY is not set (fail-open)', async () => {
      vi.stubEnv('CLERK_SECRET_KEY', '');

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleUserRoutes(req, res, '/api/users');

      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual([]);
      expect(mockGetUserList).not.toHaveBeenCalled();
    });

    it('returns mapped users when Clerk is configured', async () => {
      vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_xxx');
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

  it('returns 404 for GET on wrong path', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleUserRoutes(req, res, '/api/users/123');
    expect(res._statusCode).toBe(404);
  });
});
