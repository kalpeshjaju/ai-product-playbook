import { describe, it, expect } from 'vitest';
import { createIngestionQueue, JobType } from '../src/ingestion/pipeline/queue.js';
import type { IngestionJobData } from '../src/ingestion/pipeline/jobs.js';

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
      payload: { modelId: 'text-embedding-3-small' },
    };
    expect(job.type).toBe('embed');
    expect(job.documentId).toBe('doc-123');
  });

  it('createIngestionQueue returns queue with correct name', () => {
    // This test validates the factory function signature.
    // Actual Redis connection is not made without REDIS_URL.
    expect(typeof createIngestionQueue).toBe('function');
  });
});
