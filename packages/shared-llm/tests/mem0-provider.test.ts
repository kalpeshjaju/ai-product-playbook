/**
 * Tests for Mem0Provider — fail-open behaviour and SDK interaction.
 *
 * Strategy: construct without MEM0_API_KEY (fail-open), then inject a mock
 * client via the private field to test SDK interaction paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Mem0Provider } from '../src/memory/mem0-provider.js';

describe('Mem0Provider', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('without MEM0_API_KEY (fail-open)', () => {
    it('has name "mem0"', () => {
      const provider = new Mem0Provider();
      expect(provider.name).toBe('mem0');
    });

    it('logs info message to stderr', () => {
      new Mem0Provider();
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('MEM0_API_KEY not set'),
      );
    });

    it('add() returns "noop"', async () => {
      const provider = new Mem0Provider();
      const result = await provider.add('test', { userId: 'u1' });
      expect(result).toBe('noop');
    });

    it('search() returns empty array', async () => {
      const provider = new Mem0Provider();
      const result = await provider.search('query', { userId: 'u1' });
      expect(result).toEqual([]);
    });

    it('getAll() returns empty array', async () => {
      const provider = new Mem0Provider();
      const result = await provider.getAll('u1');
      expect(result).toEqual([]);
    });

    it('delete() resolves without throwing', async () => {
      const provider = new Mem0Provider();
      await expect(provider.delete('mem-1')).resolves.toBeUndefined();
    });
  });

  describe('with injected mock client', () => {
    const mockAdd = vi.fn();
    const mockSearch = vi.fn();
    const mockGetAll = vi.fn();
    const mockDelete = vi.fn();

    function createWithClient(): Mem0Provider {
      const provider = new Mem0Provider();
      // Inject mock client into private field to bypass require('mem0ai')
      (provider as unknown as Record<string, unknown>).client = {
        add: mockAdd,
        search: mockSearch,
        getAll: mockGetAll,
        delete: mockDelete,
      };
      return provider;
    }

    beforeEach(() => {
      mockAdd.mockReset();
      mockSearch.mockReset();
      mockGetAll.mockReset();
      mockDelete.mockReset();
    });

    it('add() extracts results[0].id', async () => {
      mockAdd.mockResolvedValue({ results: [{ id: 'mem-123' }] });
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'u1' });
      expect(result).toBe('mem-123');
    });

    it('add() falls back to top-level id', async () => {
      mockAdd.mockResolvedValue({ id: 'top-id' });
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'u1' });
      expect(result).toBe('top-id');
    });

    it('add() returns "unknown" when no id in response', async () => {
      mockAdd.mockResolvedValue({});
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'u1' });
      expect(result).toBe('unknown');
    });

    it('add() returns "error" on SDK throw', async () => {
      mockAdd.mockRejectedValue(new Error('network'));
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'u1' });
      expect(result).toBe('error');
    });

    it('add() passes correct args to SDK', async () => {
      mockAdd.mockResolvedValue({ id: 'x' });
      const provider = createWithClient();
      await provider.add('hello', { userId: 'u1', agentId: 'a1' });
      expect(mockAdd).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hello' }],
        { user_id: 'u1', agent_id: 'a1' },
      );
    });

    it('search() maps results to MemorySearchResult[]', async () => {
      mockSearch.mockResolvedValue({
        results: [{
          id: 's1', memory: 'remembered', score: 0.95,
          user_id: 'u1', created_at: '2026-01-01T00:00:00Z',
        }],
      });
      const provider = createWithClient();
      const results = await provider.search('query', { userId: 'u1' });
      expect(results).toHaveLength(1);
      expect(results[0].entry.content).toBe('remembered');
      expect(results[0].score).toBe(0.95);
    });

    it('search() returns [] on SDK throw', async () => {
      mockSearch.mockRejectedValue(new Error('fail'));
      const provider = createWithClient();
      const results = await provider.search('q', { userId: 'u1' });
      expect(results).toEqual([]);
    });

    it('getAll() maps memories to MemoryEntry[]', async () => {
      mockGetAll.mockResolvedValue([
        { id: 'm1', memory: 'fact', user_id: 'u1', created_at: '2026-01-01T00:00:00Z' },
      ]);
      const provider = createWithClient();
      const entries = await provider.getAll('u1');
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('fact');
      expect(entries[0].id).toBe('m1');
    });

    it('getAll() returns [] on SDK throw', async () => {
      mockGetAll.mockRejectedValue(new Error('fail'));
      const provider = createWithClient();
      const entries = await provider.getAll('u1');
      expect(entries).toEqual([]);
    });

    it('delete() calls SDK delete', async () => {
      mockDelete.mockResolvedValue(undefined);
      const provider = createWithClient();
      await provider.delete('mem-1');
      expect(mockDelete).toHaveBeenCalledWith('mem-1');
    });

    it('delete() swallows SDK errors', async () => {
      mockDelete.mockRejectedValue(new Error('fail'));
      const provider = createWithClient();
      await expect(provider.delete('mem-1')).resolves.toBeUndefined();
    });
  });
});
