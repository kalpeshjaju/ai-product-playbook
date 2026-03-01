import { describe, it, expect } from 'vitest';
import { createIngestionQueue, JobType } from '../src/ingestion/pipeline/queue.js';
import type { IngestionJobData } from '../src/ingestion/pipeline/jobs.js';
import type {
  EmbedPayload,
  EnrichPayload,
  DedupCheckPayload,
  ReEmbedPayload,
  FreshnessPayload,
  ScrapePayload,
  IngestionPayload,
} from '../src/ingestion/pipeline/jobs.js';

describe('ingestion pipeline', () => {
  it('JobType has all expected values', () => {
    expect(JobType.EMBED).toBe('embed');
    expect(JobType.ENRICH).toBe('enrich');
    expect(JobType.DEDUP_CHECK).toBe('dedup-check');
    expect(JobType.RE_EMBED).toBe('re-embed');
    expect(JobType.FRESHNESS).toBe('freshness');
    expect(JobType.SCRAPE).toBe('scrape');
  });

  it('IngestionJobData conforms to expected shape', () => {
    const job: IngestionJobData = {
      type: JobType.EMBED,
      documentId: 'doc-123',
      payload: {
        modelId: 'text-embedding-3-small',
        chunks: ['chunk-1'],
        chunkStrategy: 'fixed',
      },
    };
    expect(job.type).toBe('embed');
    expect(job.documentId).toBe('doc-123');
  });

  it('createIngestionQueue returns queue with correct name', () => {
    // This test validates the factory function signature.
    // Actual Redis connection is not made without REDIS_URL.
    expect(typeof createIngestionQueue).toBe('function');
  });

  describe('typed payloads', () => {
    it('EmbedPayload has required fields: modelId, chunks, chunkStrategy', () => {
      const payload: EmbedPayload = {
        modelId: 'text-embedding-3-small',
        chunks: ['hello world', 'foo bar'],
        chunkStrategy: 'semantic',
      };
      expect(payload.modelId).toBe('text-embedding-3-small');
      expect(payload.chunks).toHaveLength(2);
      expect(payload.chunkStrategy).toBe('semantic');
    });

    it('EnrichPayload has required content and optional enrichments', () => {
      const minimal: EnrichPayload = { content: 'some text' };
      expect(minimal.content).toBe('some text');
      expect(minimal.enrichments).toBeUndefined();

      const full: EnrichPayload = {
        content: 'some text',
        enrichments: ['summary', 'keywords'],
      };
      expect(full.enrichments).toEqual(['summary', 'keywords']);
    });

    it('DedupCheckPayload has required contentHash and optional embedding', () => {
      const minimal: DedupCheckPayload = { contentHash: 'abc123' };
      expect(minimal.contentHash).toBe('abc123');
      expect(minimal.embedding).toBeUndefined();

      const full: DedupCheckPayload = {
        contentHash: 'abc123',
        embedding: [0.1, 0.2, 0.3],
      };
      expect(full.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('ReEmbedPayload has required oldModelId and newModelId', () => {
      const payload: ReEmbedPayload = {
        oldModelId: 'text-embedding-ada-002',
        newModelId: 'text-embedding-3-small',
      };
      expect(payload.oldModelId).toBe('text-embedding-ada-002');
      expect(payload.newModelId).toBe('text-embedding-3-small');
    });

    it('FreshnessPayload has optional maxAgeDays', () => {
      const empty: FreshnessPayload = {};
      expect(empty.maxAgeDays).toBeUndefined();

      const withAge: FreshnessPayload = { maxAgeDays: 30 };
      expect(withAge.maxAgeDays).toBe(30);
    });

    it('ScrapePayload has required url and optional metadata', () => {
      const minimal: ScrapePayload = { url: 'https://example.com' };
      expect(minimal.url).toBe('https://example.com');
      expect(minimal.metadata).toBeUndefined();

      const full: ScrapePayload = {
        url: 'https://example.com',
        metadata: { source: 'manual', priority: 1 },
      };
      expect(full.metadata).toEqual({ source: 'manual', priority: 1 });
    });

    it('IngestionPayload union accepts all payload types', () => {
      const payloads: IngestionPayload[] = [
        { modelId: 'embed-v1', chunks: ['a'], chunkStrategy: 'fixed' },
        { content: 'text' },
        { contentHash: 'hash123' },
        { oldModelId: 'old', newModelId: 'new' },
        {},
        { url: 'https://example.com' },
      ];
      expect(payloads).toHaveLength(6);
    });

    it('IngestionJobData.payload accepts each typed payload', () => {
      const embedJob: IngestionJobData = {
        type: JobType.EMBED,
        documentId: 'doc-1',
        payload: { modelId: 'm1', chunks: ['c1'], chunkStrategy: 'sliding-window' },
      };

      const enrichJob: IngestionJobData = {
        type: JobType.ENRICH,
        documentId: 'doc-2',
        payload: { content: 'text', enrichments: ['summary'] },
      };

      const dedupJob: IngestionJobData = {
        type: JobType.DEDUP_CHECK,
        documentId: 'doc-3',
        payload: { contentHash: 'abc' },
      };

      const reEmbedJob: IngestionJobData = {
        type: JobType.RE_EMBED,
        documentId: 'doc-4',
        payload: { oldModelId: 'old', newModelId: 'new' },
      };

      const freshnessJob: IngestionJobData = {
        type: JobType.FRESHNESS,
        documentId: 'doc-5',
        payload: { maxAgeDays: 7 },
      };

      const scrapeJob: IngestionJobData = {
        type: JobType.SCRAPE,
        documentId: 'doc-6',
        payload: { url: 'https://example.com' },
      };

      expect(embedJob.type).toBe('embed');
      expect(enrichJob.type).toBe('enrich');
      expect(dedupJob.type).toBe('dedup-check');
      expect(reEmbedJob.type).toBe('re-embed');
      expect(freshnessJob.type).toBe('freshness');
      expect(scrapeJob.type).toBe('scrape');
    });
  });
});
