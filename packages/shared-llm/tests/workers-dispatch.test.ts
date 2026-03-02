import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { DedupCheckPayload, FreshnessPayload, IngestionJobData, ReEmbedPayload } from '../src/ingestion/pipeline/jobs.js';

const mockProcessEmbed = vi.fn();
const mockProcessEnrich = vi.fn();
const mockProcessDedupCheck = vi.fn();
const mockProcessReEmbed = vi.fn();
const mockProcessFreshness = vi.fn();
const mockProcessScrape = vi.fn();

vi.mock('../src/ingestion/pipeline/processors/embed.js', () => ({
  processEmbed: (...args: unknown[]) => mockProcessEmbed(...args),
}));
vi.mock('../src/ingestion/pipeline/processors/enrich.js', () => ({
  processEnrich: (...args: unknown[]) => mockProcessEnrich(...args),
}));
vi.mock('../src/ingestion/pipeline/processors/dedup-check.js', () => ({
  processDedupCheck: (...args: unknown[]) => mockProcessDedupCheck(...args),
}));
vi.mock('../src/ingestion/pipeline/processors/re-embed.js', () => ({
  processReEmbed: (...args: unknown[]) => mockProcessReEmbed(...args),
}));
vi.mock('../src/ingestion/pipeline/processors/freshness.js', () => ({
  processFreshness: (...args: unknown[]) => mockProcessFreshness(...args),
}));
vi.mock('../src/ingestion/pipeline/processors/scrape.js', () => ({
  processScrape: (...args: unknown[]) => mockProcessScrape(...args),
}));

import { processIngestionJob } from '../src/ingestion/pipeline/workers.js';
import { JobType } from '../src/ingestion/pipeline/queue.js';

function createJob(data: IngestionJobData): Job<IngestionJobData> {
  return {
    data,
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<IngestionJobData>;
}

describe('processIngestionJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessEmbed.mockResolvedValue({ vectors: [[0.1]], modelId: 'm', documentId: 'doc-1' });
    mockProcessEnrich.mockResolvedValue({ entities: [], topics: [], summary: '', documentId: 'doc-1' });
    mockProcessDedupCheck.mockResolvedValue({
      documentId: 'doc-1',
      isDuplicate: false,
      hashDuplicate: false,
      nearDuplicate: false,
      similarity: 0,
    });
    mockProcessReEmbed.mockResolvedValue({
      documentId: 'doc-1',
      oldModelId: 'old-model',
      newModelId: 'new-model',
      vectors: [[0.1]],
    });
    mockProcessFreshness.mockResolvedValue({
      documentId: 'doc-1',
      status: 'fresh',
      freshnessMultiplier: 1,
    });
    mockProcessScrape.mockResolvedValue(null);
  });

  it('passes dedup payload context into processDedupCheck', async () => {
    const payload: DedupCheckPayload = {
      contentHash: 'hash-123',
      knownHashes: ['h1', 'h2'],
      existingEmbeddings: [{ docId: 'doc-x', embedding: [0.1, 0.2] }],
    };
    const job = createJob({
      type: JobType.DEDUP_CHECK,
      documentId: 'doc-1',
      payload,
    });

    await processIngestionJob(job);

    expect(mockProcessDedupCheck).toHaveBeenCalledOnce();
    const options = mockProcessDedupCheck.mock.calls[0]?.[1] as {
      knownHashes?: Set<string>;
      existingEmbeddings?: Array<{ docId: string; embedding: number[] }>;
    };
    expect(options.knownHashes).toBeInstanceOf(Set);
    expect(options.knownHashes?.has('h1')).toBe(true);
    expect(options.existingEmbeddings).toEqual(payload.existingEmbeddings);
  });

  it('passes re-embed chunks from payload into processReEmbed', async () => {
    const payload: ReEmbedPayload = {
      oldModelId: 'old-model',
      newModelId: 'new-model',
      chunks: ['chunk-a', 'chunk-b'],
    };
    const job = createJob({
      type: JobType.RE_EMBED,
      documentId: 'doc-1',
      payload,
    });

    await processIngestionJob(job);

    expect(mockProcessReEmbed).toHaveBeenCalledWith(
      job,
      { chunks: ['chunk-a', 'chunk-b'] },
    );
  });

  it('parses freshness dates from payload before calling processFreshness', async () => {
    const payload: FreshnessPayload = {
      ingestedAt: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-01T00:00:00.000Z',
    };
    const job = createJob({
      type: JobType.FRESHNESS,
      documentId: 'doc-1',
      payload,
    });

    await processIngestionJob(job);

    const docInfo = mockProcessFreshness.mock.calls[0]?.[1] as {
      ingestedAt: Date | null;
      validUntil: Date | null;
    };
    expect(docInfo.ingestedAt?.toISOString()).toBe(payload.ingestedAt);
    expect(docInfo.validUntil?.toISOString()).toBe(payload.validUntil);
  });
});

