import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, FreshnessPayload } from '../src/ingestion/pipeline/jobs.js';

import { processFreshness } from '../src/ingestion/pipeline/processors/freshness.js';

describe('FRESHNESS worker processor', () => {
  it('marks document as fresh when within 30 days', async () => {
    const job = {
      data: {
        type: 'freshness',
        documentId: 'doc-123',
        payload: {} satisfies FreshnessPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processFreshness(job, {
      ingestedAt: new Date(),
      validUntil: null,
    });

    expect(result.status).toBe('fresh');
    expect(result.freshnessMultiplier).toBe(1.0);
  });

  it('marks document as aging when 30-90 days old', async () => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const job = {
      data: {
        type: 'freshness',
        documentId: 'doc-234',
        payload: {} satisfies FreshnessPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processFreshness(job, {
      ingestedAt: sixtyDaysAgo,
      validUntil: null,
    });

    expect(result.status).toBe('aging');
    expect(result.freshnessMultiplier).toBe(0.9);
  });

  it('marks document as stale when older than 90 days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const job = {
      data: {
        type: 'freshness',
        documentId: 'doc-456',
        payload: {} satisfies FreshnessPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processFreshness(job, {
      ingestedAt: oldDate,
      validUntil: null,
    });

    expect(result.status).toBe('stale');
    expect(result.freshnessMultiplier).toBe(0.8);
  });

  it('marks document as expired when valid_until has passed', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    const job = {
      data: {
        type: 'freshness',
        documentId: 'doc-789',
        payload: {} satisfies FreshnessPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processFreshness(job, {
      ingestedAt: new Date(),
      validUntil: pastDate,
    });

    expect(result.status).toBe('expired');
    expect(result.freshnessMultiplier).toBe(0);
  });
});
