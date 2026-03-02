import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, ReEmbedPayload } from '../src/ingestion/pipeline/jobs.js';

vi.mock('../src/llm-client.js', () => ({
  createLLMClient: () => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.03) }],
        usage: { prompt_tokens: 50 },
      }),
    },
  }),
}));

vi.mock('../src/cost-ledger.js', () => ({
  costLedger: { recordCall: vi.fn() },
}));

import { processReEmbed } from '../src/ingestion/pipeline/processors/re-embed.js';

describe('RE_EMBED worker processor', () => {
  it('generates new embeddings with the new model', async () => {
    const job = {
      data: {
        type: 're-embed',
        documentId: 'doc-123',
        payload: {
          oldModelId: 'text-embedding-ada-002',
          newModelId: 'text-embedding-3-small',
          chunks: ['chunk 1'],
        } satisfies ReEmbedPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processReEmbed(job, { chunks: ['chunk 1'] });

    expect(result.newModelId).toBe('text-embedding-3-small');
    expect(result.oldModelId).toBe('text-embedding-ada-002');
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toHaveLength(1536);
    expect(result.documentId).toBe('doc-123');
  });

  it('throws when no chunks provided', async () => {
    const job = {
      data: {
        type: 're-embed',
        documentId: 'doc-456',
        payload: {
          oldModelId: 'ada-002',
          newModelId: 'text-embedding-3-small',
          chunks: [],
        } satisfies ReEmbedPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    await expect(processReEmbed(job, { chunks: [] })).rejects.toThrow('No chunks');
  });
});
