/**
 * Tests for enqueuePostPersistJobs — verifies queue integration is fail-open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQueueAdd = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  createLLMClient: vi.fn(),
  costLedger: { recordCall: vi.fn() },
  routeQuery: vi.fn().mockReturnValue({ tier: 'balanced' }),
  createIngestionQueue: vi.fn(() => ({
    add: mockQueueAdd,
  })),
  JobType: {
    EMBED: 'embed', ENRICH: 'enrich', DEDUP_CHECK: 'dedup-check',
    RE_EMBED: 're-embed', FRESHNESS: 'freshness', SCRAPE: 'scrape',
  },
}));

vi.mock('../src/db/index.js', () => ({
  db: {},
  documents: {},
  embeddings: {},
}));

describe('enqueuePostPersistJobs', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it('enqueues enrich + dedup-check jobs', async () => {
    mockQueueAdd.mockResolvedValue(undefined);

    const { enqueuePostPersistJobs } = await import('../src/services/document-persistence.js');
    await enqueuePostPersistJobs('doc-123');

    expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'enrich',
      expect.objectContaining({ type: 'enrich', documentId: 'doc-123' }),
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'dedup-check',
      expect.objectContaining({ type: 'dedup-check', documentId: 'doc-123' }),
    );
  });

  it('enqueues freshness job with delay when validUntil is set', async () => {
    mockQueueAdd.mockResolvedValue(undefined);

    const futureDate = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
    const { enqueuePostPersistJobs } = await import('../src/services/document-persistence.js');
    await enqueuePostPersistJobs('doc-456', futureDate);

    expect(mockQueueAdd).toHaveBeenCalledTimes(3);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'freshness',
      expect.objectContaining({ type: 'freshness', documentId: 'doc-456' }),
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });

  it('does not throw when queue is unavailable (fail-open)', async () => {
    mockQueueAdd.mockRejectedValue(new Error('Redis connection refused'));

    const { enqueuePostPersistJobs } = await import('../src/services/document-persistence.js');
    // Should not throw
    await expect(enqueuePostPersistJobs('doc-789')).resolves.toBeUndefined();
  });

  it('does nothing when REDIS_URL is not set', async () => {
    delete process.env.REDIS_URL;

    // Re-import to pick up env change — need to reset module cache
    vi.resetModules();
    vi.mock('@playbook/shared-llm', () => ({
      createLLMClient: vi.fn(),
      costLedger: { recordCall: vi.fn() },
      routeQuery: vi.fn().mockReturnValue({ tier: 'balanced' }),
      createIngestionQueue: vi.fn(() => ({ add: mockQueueAdd })),
      JobType: {
        EMBED: 'embed', ENRICH: 'enrich', DEDUP_CHECK: 'dedup-check',
        RE_EMBED: 're-embed', FRESHNESS: 'freshness', SCRAPE: 'scrape',
      },
    }));
    vi.mock('../src/db/index.js', () => ({
      db: {}, documents: {}, embeddings: {},
    }));

    const mod = await import('../src/services/document-persistence.js');
    await mod.enqueuePostPersistJobs('doc-000');
    // mockQueueAdd should NOT be called since REDIS_URL is unset
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
