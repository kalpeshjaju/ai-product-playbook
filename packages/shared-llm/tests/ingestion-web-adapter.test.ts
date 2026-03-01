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

  it('returns null when Crawl4AI service is unreachable', async () => {
    vi.stubEnv('CRAWL4AI_URL', 'http://localhost:19999');
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await ingester.ingest(Buffer.from('https://example.com'), 'text/x-uri');
    expect(result).toBeNull();
  });

  it('returns IngestResult on successful scrape', async () => {
    vi.stubEnv('CRAWL4AI_URL', 'http://localhost:8000');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        markdown: '# Page Title\n\nPage content here.',
        metadata: { url: 'https://example.com', title: 'Page Title', statusCode: 200 },
      }),
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'), 'text/x-uri');
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Page content');
    expect(result!.sourceType).toBe('web');
    expect(result!.metadata.url).toBe('https://example.com');
    expect(result!.contentHash).toBeTruthy();

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('http://localhost:8000/scrape');
  });

  it('returns null on service HTTP failure', async () => {
    vi.stubEnv('CRAWL4AI_URL', 'http://localhost:8000');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'), 'text/x-uri');
    expect(result).toBeNull();
  });

  it('returns null when scrape reports failure', async () => {
    vi.stubEnv('CRAWL4AI_URL', 'http://localhost:8000');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        markdown: '',
        metadata: { url: 'https://example.com', error: 'Navigation timeout' },
      }),
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'), 'text/x-uri');
    expect(result).toBeNull();
  });

  it('uses default URL when CRAWL4AI_URL not set', async () => {
    delete process.env.CRAWL4AI_URL;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        markdown: '# Test',
        metadata: { url: 'https://example.com' },
      }),
    });

    await ingester.ingest(Buffer.from('https://example.com'), 'text/x-uri');
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('http://localhost:8000/scrape');
  });
});
