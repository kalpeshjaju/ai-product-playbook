import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebIngester } from '../src/ingestion/adapters/web.js';

const originalFetch = globalThis.fetch;

describe('WebIngester', () => {
  const ingester = new WebIngester();

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('handles text/x-uri MIME type', () => {
    expect(ingester.canHandle('text/x-uri')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('returns null when FIRECRAWL_API_KEY not set', async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const result = await ingester.ingest(Buffer.from('https://example.com'));
    expect(result).toBeNull();
  });

  it('returns IngestResult on successful scrape', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { markdown: '# Page Title\n\nPage content here.', metadata: { title: 'Page Title' } },
      }),
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'));
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Page content');
    expect(result!.sourceType).toBe('web');
    expect(result!.metadata.url).toBe('https://example.com');
  });

  it('returns null on API failure', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'));
    expect(result).toBeNull();
  });
});
