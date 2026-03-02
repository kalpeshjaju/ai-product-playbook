import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, EnrichPayload, DedupCheckPayload, FreshnessPayload } from '../src/ingestion/pipeline/jobs.js';

vi.mock('../src/llm-client.js', () => ({
  createLLMClient: () => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"entities":[],"topics":["test"],"summary":"test"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      },
    },
  }),
}));

vi.mock('../src/cost-ledger.js', () => ({
  costLedger: { recordCall: vi.fn() },
}));

import { processEnrich } from '../src/ingestion/pipeline/processors/enrich.js';
import { processDedupCheck } from '../src/ingestion/pipeline/processors/dedup-check.js';
import { processFreshness } from '../src/ingestion/pipeline/processors/freshness.js';

describe('Idempotency — double-execution safety (§19 HARD GATE)', () => {
  it('ENRICH: running twice produces identical results', async () => {
    const job = {
      data: {
        type: 'enrich',
        documentId: 'doc-idem-1',
        payload: { content: 'Some test content for enrichment' } satisfies EnrichPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result1 = await processEnrich(job);
    const result2 = await processEnrich(job);

    expect(result1.documentId).toBe(result2.documentId);
    expect(result1.topics).toEqual(result2.topics);
    expect(result1.summary).toBe(result2.summary);
  });

  it('DEDUP_CHECK: running twice produces identical results (no side effects)', async () => {
    const job = {
      data: {
        type: 'dedup-check',
        documentId: 'doc-idem-2',
        payload: { contentHash: 'hash-abc' } satisfies DedupCheckPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const opts = { knownHashes: new Set(['other-hash']) };
    const result1 = await processDedupCheck(job, opts);
    const result2 = await processDedupCheck(job, opts);

    expect(result1.isDuplicate).toBe(result2.isDuplicate);
    expect(result1.hashDuplicate).toBe(result2.hashDuplicate);
    expect(result1.similarity).toBe(result2.similarity);
  });

  it('FRESHNESS: running twice produces identical results', async () => {
    const fixedDate = new Date('2026-01-01T00:00:00Z');

    const job = {
      data: {
        type: 'freshness',
        documentId: 'doc-idem-3',
        payload: {} satisfies FreshnessPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result1 = await processFreshness(job, { ingestedAt: fixedDate, validUntil: null });
    const result2 = await processFreshness(job, { ingestedAt: fixedDate, validUntil: null });

    expect(result1.status).toBe(result2.status);
    expect(result1.freshnessMultiplier).toBe(result2.freshnessMultiplier);
  });
});
