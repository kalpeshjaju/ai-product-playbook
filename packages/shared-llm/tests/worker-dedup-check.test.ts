import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, DedupCheckPayload } from '../src/ingestion/pipeline/jobs.js';
import { NEAR_DEDUP_THRESHOLD } from '../src/ingestion/dedup/near.js';
import { processDedupCheck } from '../src/ingestion/pipeline/processors/dedup-check.js';

describe('DEDUP_CHECK worker processor', () => {
  it('returns not duplicate when no options provided', async () => {
    const job = {
      data: {
        type: 'dedup-check',
        documentId: 'doc-123',
        payload: { contentHash: 'abc123' } satisfies DedupCheckPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processDedupCheck(job);
    expect(result.isDuplicate).toBe(false);
    expect(result.hashDuplicate).toBe(false);
  });

  it('detects hash duplicate from known hashes', async () => {
    const job = {
      data: {
        type: 'dedup-check',
        documentId: 'doc-456',
        payload: { contentHash: 'known-hash' } satisfies DedupCheckPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processDedupCheck(job, { knownHashes: new Set(['known-hash']) });
    expect(result.hashDuplicate).toBe(true);
    expect(result.isDuplicate).toBe(true);
  });

  it('detects near-duplicate via cosine similarity', async () => {
    const embedding = Array(1536).fill(0.5);
    const almostSame = Array(1536).fill(0.5001);

    const job = {
      data: {
        type: 'dedup-check',
        documentId: 'doc-789',
        payload: { contentHash: 'unique-hash', embedding } satisfies DedupCheckPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processDedupCheck(job, {
      existingEmbeddings: [{ docId: 'doc-existing', embedding: almostSame }],
    });
    expect(result.nearDuplicate).toBe(true);
    expect(result.similarDocId).toBe('doc-existing');
  });

  it('returns not duplicate when similarity is below threshold', async () => {
    const embedding = Array(1536).fill(0.5);
    const different = Array(1536).fill(-0.5);

    const job = {
      data: {
        type: 'dedup-check',
        documentId: 'doc-999',
        payload: { contentHash: 'unique', embedding } satisfies DedupCheckPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processDedupCheck(job, {
      existingEmbeddings: [{ docId: 'doc-other', embedding: different }],
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.nearDuplicate).toBe(false);
  });

  it('exports NEAR_DEDUP_THRESHOLD as 0.95', () => {
    expect(NEAR_DEDUP_THRESHOLD).toBe(0.95);
  });
});
