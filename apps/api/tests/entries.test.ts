/**
 * Tests for playbook entries routes (routes/entries.ts)
 *
 * Mocks the Drizzle db to test CRUD and validation without a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { createMockReq, createMockRes } from './helpers.js';

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
  playbookEntries: {
    id: 'id',
    title: 'title',
    summary: 'summary',
    content: 'content',
    category: 'category',
    status: 'status',
    sectionRef: 'section_ref',
    sortOrder: 'sort_order',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => [a, b],
  desc: (a: unknown) => [a, 'desc'],
}));

import { handleEntryRoutes } from '../src/routes/entries.js';

function createBodyParser(body: Record<string, unknown>): (req: IncomingMessage) => Promise<Record<string, unknown>> {
  return () => Promise.resolve(body);
}

describe('handleEntryRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/entries (list)', () => {
    it('returns empty array when no entries', async () => {
      const listChain = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
        $dynamic: vi.fn().mockReturnThis(),
      };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue(listChain),
      });

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries', createBodyParser({}));
      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual([]);
    });

    it('returns entries when category filter is valid', async () => {
      const rows = [
        { id: 'e1', title: 'Entry 1', summary: 'S1', category: 'resilience', status: 'active' },
      ];
      const listChain = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(rows),
        $dynamic: vi.fn().mockReturnThis(),
      };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue(listChain),
      });

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries?category=resilience', createBodyParser({}));
      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual(rows);
    });
  });

  describe('GET /api/entries/:id', () => {
    it('returns 404 when entry not found', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/missing-id', createBodyParser({}));
      expect(res._statusCode).toBe(404);
      expect(res._body).toContain('Entry not found');
    });

    it('returns entry when found', async () => {
      const entry = {
        id: 'entry-1',
        title: 'JSON Extraction',
        summary: 'Multi-strategy repair',
        category: 'resilience',
        status: 'active',
      };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([entry]),
          }),
        }),
      });

      const req = createMockReq('GET');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/entry-1', createBodyParser({}));
      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual(entry);
    });
  });

  describe('POST /api/entries', () => {
    it('returns 400 when title, summary, or category missing', async () => {
      const req = createMockReq('POST');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries', createBodyParser({ title: 'Only title' }));
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain('Required');
    });

    it('returns 400 when category is invalid', async () => {
      const req = createMockReq('POST');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries', createBodyParser({
        title: 'Test',
        summary: 'Summary',
        category: 'invalid-category',
      }));
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain('Invalid category');
    });

    it('returns 201 and created entry when valid', async () => {
      const created = {
        id: 'new-uuid',
        title: 'New Entry',
        summary: 'Summary',
        category: 'resilience',
        status: 'draft',
      };
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([created]),
        }),
      });

      const req = createMockReq('POST');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries', createBodyParser({
        title: 'New Entry',
        summary: 'Summary',
        category: 'resilience',
      }));
      expect(res._statusCode).toBe(201);
      expect(JSON.parse(res._body)).toEqual(created);
    });
  });

  describe('PATCH /api/entries/:id', () => {
    it('returns 400 when no fields to update', async () => {
      const req = createMockReq('PATCH');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/entry-1', createBodyParser({}));
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain('No fields to update');
    });

    it('returns 400 when status is invalid', async () => {
      const req = createMockReq('PATCH');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/entry-1', createBodyParser({ status: 'invalid' }));
      expect(res._statusCode).toBe(400);
      expect(res._body).toContain('Invalid status');
    });

    it('returns 404 when entry not found', async () => {
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const req = createMockReq('PATCH');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/missing', createBodyParser({ title: 'Updated' }));
      expect(res._statusCode).toBe(404);
    });

    it('returns 200 and updated entry when valid', async () => {
      const updated = { id: 'entry-1', title: 'Updated Title', summary: 'S', category: 'resilience', status: 'active' };
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const req = createMockReq('PATCH');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/entry-1', createBodyParser({ title: 'Updated Title' }));
      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual(updated);
    });
  });

  describe('DELETE /api/entries/:id', () => {
    it('returns 404 when entry not found', async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      const req = createMockReq('DELETE');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/missing', createBodyParser({}));
      expect(res._statusCode).toBe(404);
    });

    it('returns 200 with deleted id when found', async () => {
      mockDelete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
        }),
      });

      const req = createMockReq('DELETE');
      const res = createMockRes();
      await handleEntryRoutes(req, res, '/api/entries/entry-1', createBodyParser({}));
      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual({ deleted: 'entry-1' });
    });
  });

  it('returns 404 for unknown route', async () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    await handleEntryRoutes(req, res, '/api/entries/foo/bar', createBodyParser({}));
    expect(res._statusCode).toBe(404);
  });
});
