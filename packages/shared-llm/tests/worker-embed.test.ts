import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, EmbedPayload } from '../src/ingestion/pipeline/jobs.js';

vi.mock('../src/llm-client.js', () => ({
  createLLMClient: () => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [
          { embedding: Array(1536).fill(0.01) },
          { embedding: Array(1536).fill(0.02) },
        ],
        usage: { prompt_tokens: 100 },
      }),
    },
  }),
}));

vi.mock('../src/cost-ledger.js', () => ({
  costLedger: { recordCall: vi.fn() },
}));

import { processEmbed } from '../src/ingestion/pipeline/processors/embed.js';

describe('EMBED worker processor', () => {
  it('generates embeddings for chunks and returns vectors', async () => {
    const job = {
      data: {
        type: 'embed',
        documentId: 'doc-123',
        payload: {
          modelId: 'text-embedding-3-small',
          chunks: ['chunk one', 'chunk two'],
          chunkStrategy: 'semantic',
        } satisfies EmbedPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processEmbed(job);
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]).toHaveLength(1536);
    expect(result.modelId).toBe('text-embedding-3-small');
    expect(result.documentId).toBe('doc-123');
  });

  it('throws on empty chunks array', async () => {
    const job = {
      data: {
        type: 'embed',
        documentId: 'doc-456',
        payload: {
          modelId: 'text-embedding-3-small',
          chunks: [],
          chunkStrategy: 'fixed',
        } satisfies EmbedPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    await expect(processEmbed(job)).rejects.toThrow('No chunks');
  });

  it('is idempotent — calling twice returns same shape', async () => {
    const job = {
      data: {
        type: 'embed',
        documentId: 'doc-789',
        payload: {
          modelId: 'text-embedding-3-small',
          chunks: ['hello world'],
          chunkStrategy: 'fixed',
        } satisfies EmbedPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result1 = await processEmbed(job);
    const result2 = await processEmbed(job);
    expect(result1.vectors.length).toBe(result2.vectors.length);
  });
});
