import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiFeedIngester } from '../src/ingestion/adapters/api-feed.js';

const originalFetch = globalThis.fetch;

describe('ApiFeedIngester', () => {
  const ingester = new ApiFeedIngester();

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles application/x-api-feed MIME type', () => {
    expect(ingester.canHandle('application/x-api-feed')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('fetches JSON from URL and returns structured text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Test', items: [1, 2, 3] }),
    });

    const payload = JSON.stringify({ url: 'https://api.example.com/data', method: 'GET' });
    const result = await ingester.ingest(Buffer.from(payload));

    expect(result).not.toBeNull();
    expect(result!.text).toContain('title');
    expect(result!.sourceType).toBe('api');
  });

  it('returns null on invalid JSON payload', async () => {
    const result = await ingester.ingest(Buffer.from('not json'));
    expect(result).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const payload = JSON.stringify({ url: 'https://api.example.com/data' });
    const result = await ingester.ingest(Buffer.from(payload));
    expect(result).toBeNull();
  });
});
