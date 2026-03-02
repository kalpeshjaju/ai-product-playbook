/**
 * Tests for ZepProvider — fail-open behaviour, sessionId composition, SDK interaction.
 *
 * Strategy: construct without ZEP_API_KEY (fail-open), then inject a mock
 * client via the private field to test SDK interaction paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZepProvider } from '../src/memory/zep-provider.js';

describe('ZepProvider', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('without ZEP_API_KEY (fail-open)', () => {
    it('has name "zep"', () => {
      const provider = new ZepProvider();
      expect(provider.name).toBe('zep');
    });

    it('logs info message to stderr', () => {
      new ZepProvider();
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining('ZEP_API_KEY not set'),
      );
    });

    it('add() returns "noop"', async () => {
      const provider = new ZepProvider();
      const result = await provider.add('test', { userId: 'u1' });
      expect(result).toBe('noop');
    });

    it('search() returns empty array', async () => {
      const provider = new ZepProvider();
      const result = await provider.search('query', { userId: 'u1' });
      expect(result).toEqual([]);
    });

    it('getAll() returns empty array', async () => {
      const provider = new ZepProvider();
      const result = await provider.getAll('u1');
      expect(result).toEqual([]);
    });

    it('delete() resolves without throwing', async () => {
      const provider = new ZepProvider();
      await expect(provider.delete('mem-1')).resolves.toBeUndefined();
    });
  });

  describe('with injected mock client', () => {
    const mockMemoryAdd = vi.fn();
    const mockMemorySearch = vi.fn();
    const mockGetSessionMessages = vi.fn();
    const mockDeleteMessage = vi.fn();

    function createWithClient(): ZepProvider {
      const provider = new ZepProvider();
      // Inject mock client into private field to bypass require('@getzep/zep-js')
      (provider as unknown as Record<string, unknown>).client = {
        memory: { add: mockMemoryAdd, search: mockMemorySearch },
        message: {
          getSessionMessages: mockGetSessionMessages,
          deleteMessage: mockDeleteMessage,
        },
      };
      return provider;
    }

    beforeEach(() => {
      mockMemoryAdd.mockReset();
      mockMemorySearch.mockReset();
      mockGetSessionMessages.mockReset();
      mockDeleteMessage.mockReset();
    });

    it('add() returns sessionId (userId only)', async () => {
      mockMemoryAdd.mockResolvedValue(undefined);
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'user1' });
      expect(result).toBe('user1');
    });

    it('add() returns composed sessionId (userId + agentId)', async () => {
      mockMemoryAdd.mockResolvedValue(undefined);
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'user1', agentId: 'agent1' });
      expect(result).toBe('user1__agent1');
    });

    it('add() calls memory.add with correct message shape', async () => {
      mockMemoryAdd.mockResolvedValue(undefined);
      const provider = createWithClient();
      await provider.add('hello', { userId: 'u1', metadata: { source: 'test' } });
      expect(mockMemoryAdd).toHaveBeenCalledWith('u1', {
        messages: [{
          role: 'user',
          role_type: 'user',
          content: 'hello',
          metadata: { source: 'test' },
        }],
      });
    });

    it('add() returns "error" on SDK throw', async () => {
      mockMemoryAdd.mockRejectedValue(new Error('network'));
      const provider = createWithClient();
      const result = await provider.add('content', { userId: 'u1' });
      expect(result).toBe('error');
    });

    it('search() maps results to MemorySearchResult[]', async () => {
      mockMemorySearch.mockResolvedValue([{
        message: { uuid: 'msg-1', content: 'found', created_at: '2026-01-01T00:00:00Z' },
        score: 0.88,
        metadata: { tag: 'test' },
      }]);
      const provider = createWithClient();
      const results = await provider.search('query', { userId: 'u1' });
      expect(results).toHaveLength(1);
      expect(results[0].entry.id).toBe('msg-1');
      expect(results[0].entry.content).toBe('found');
      expect(results[0].score).toBe(0.88);
    });

    it('search() uses default limit of 10', async () => {
      mockMemorySearch.mockResolvedValue([]);
      const provider = createWithClient();
      await provider.search('q', { userId: 'u1' });
      expect(mockMemorySearch).toHaveBeenCalledWith('u1', { text: 'q', limit: 10 });
    });

    it('search() uses composed sessionId with agentId', async () => {
      mockMemorySearch.mockResolvedValue([]);
      const provider = createWithClient();
      await provider.search('q', { userId: 'u1', agentId: 'a1' });
      expect(mockMemorySearch).toHaveBeenCalledWith('u1__a1', expect.any(Object));
    });

    it('search() returns [] on SDK throw', async () => {
      mockMemorySearch.mockRejectedValue(new Error('fail'));
      const provider = createWithClient();
      const results = await provider.search('q', { userId: 'u1' });
      expect(results).toEqual([]);
    });

    it('getAll() maps messages to MemoryEntry[]', async () => {
      mockGetSessionMessages.mockResolvedValue({
        messages: [
          { uuid: 'm1', content: 'hi', role: 'user', created_at: '2026-01-01T00:00:00Z' },
        ],
      });
      const provider = createWithClient();
      const entries = await provider.getAll('u1', 'a1');
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('hi');
      expect(entries[0].userId).toBe('u1');
      expect(entries[0].agentId).toBe('a1');
    });

    it('getAll() uses composed sessionId', async () => {
      mockGetSessionMessages.mockResolvedValue({ messages: [] });
      const provider = createWithClient();
      await provider.getAll('u1', 'a1');
      expect(mockGetSessionMessages).toHaveBeenCalledWith('u1__a1');
    });

    it('getAll() returns [] on SDK throw', async () => {
      mockGetSessionMessages.mockRejectedValue(new Error('fail'));
      const provider = createWithClient();
      const entries = await provider.getAll('u1');
      expect(entries).toEqual([]);
    });

    it('delete() calls message.deleteMessage', async () => {
      mockDeleteMessage.mockResolvedValue(undefined);
      const provider = createWithClient();
      await provider.delete('msg-1');
      expect(mockDeleteMessage).toHaveBeenCalledWith('msg-1');
    });

    it('delete() swallows SDK errors', async () => {
      mockDeleteMessage.mockRejectedValue(new Error('fail'));
      const provider = createWithClient();
      await expect(provider.delete('msg-1')).resolves.toBeUndefined();
    });
  });
});
