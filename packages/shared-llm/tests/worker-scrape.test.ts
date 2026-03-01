import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, ScrapePayload } from '../src/ingestion/pipeline/jobs.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { processScrape } from '../src/ingestion/pipeline/processors/scrape.js';

describe('SCRAPE worker processor', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('scrapes URL and returns markdown content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        markdown: '# Page Title\nSome content here.',
        metadata: { title: 'Page Title' },
      }),
    });

    const job = {
      data: {
        type: 'scrape',
        documentId: 'doc-123',
        payload: {
          url: 'https://example.com/page',
        } satisfies ScrapePayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processScrape(job);
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Page Title');
    expect(result!.sourceType).toBe('web');
    expect(result!.contentHash).toBeTruthy();
  });

  it('returns null when Crawl4AI is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const job = {
      data: {
        type: 'scrape',
        documentId: 'doc-456',
        payload: {
          url: 'https://unreachable.example.com',
        } satisfies ScrapePayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processScrape(job);
    expect(result).toBeNull();
  });

  it('returns null on non-200 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const job = {
      data: {
        type: 'scrape',
        documentId: 'doc-789',
        payload: { url: 'https://error.example.com' } satisfies ScrapePayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processScrape(job);
    expect(result).toBeNull();
  });

  it('returns null when Crawl4AI returns empty content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, markdown: '', metadata: {} }),
    });

    const job = {
      data: {
        type: 'scrape',
        documentId: 'doc-999',
        payload: { url: 'https://empty.example.com' } satisfies ScrapePayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processScrape(job);
    expect(result).toBeNull();
  });
});
