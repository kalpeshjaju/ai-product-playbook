import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IngestionJobData, EnrichPayload } from '../src/ingestion/pipeline/jobs.js';

vi.mock('../src/llm-client.js', () => ({
  createLLMClient: () => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                entities: [{ name: 'TypeScript', type: 'technology' }],
                topics: ['programming', 'web development'],
                summary: 'A document about TypeScript.',
              }),
            },
          }],
          usage: { prompt_tokens: 200, completion_tokens: 50 },
        }),
      },
    },
  }),
}));

vi.mock('../src/cost-ledger.js', () => ({
  costLedger: { recordCall: vi.fn() },
}));

import { processEnrich } from '../src/ingestion/pipeline/processors/enrich.js';

describe('ENRICH worker processor', () => {
  it('extracts entities and topics from content', async () => {
    const job = {
      data: {
        type: 'enrich',
        documentId: 'doc-123',
        payload: {
          content: 'TypeScript is a strongly typed programming language.',
        } satisfies EnrichPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processEnrich(job);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe('TypeScript');
    expect(result.entities[0]!.type).toBe('technology');
    expect(result.topics).toContain('programming');
    expect(result.topics).toContain('web development');
    expect(result.summary).toBe('A document about TypeScript.');
    expect(result.documentId).toBe('doc-123');
  });

  it('returns empty enrichment on empty content', async () => {
    const job = {
      data: {
        type: 'enrich',
        documentId: 'doc-456',
        payload: { content: '' } satisfies EnrichPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processEnrich(job);
    expect(result.entities).toEqual([]);
    expect(result.topics).toEqual([]);
    expect(result.summary).toBe('');
    expect(result.documentId).toBe('doc-456');
  });

  it('returns empty enrichment on whitespace-only content', async () => {
    const job = {
      data: {
        type: 'enrich',
        documentId: 'doc-789',
        payload: { content: '   \n\t  ' } satisfies EnrichPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result = await processEnrich(job);
    expect(result.entities).toEqual([]);
    expect(result.topics).toEqual([]);
    expect(result.summary).toBe('');
  });

  it('is idempotent — calling twice returns same shape', async () => {
    const job = {
      data: {
        type: 'enrich',
        documentId: 'doc-idem',
        payload: {
          content: 'React is a JavaScript library for building user interfaces.',
        } satisfies EnrichPayload,
      },
      log: vi.fn(),
    } as unknown as Job<IngestionJobData>;

    const result1 = await processEnrich(job);
    const result2 = await processEnrich(job);
    expect(result1.entities.length).toBe(result2.entities.length);
    expect(result1.topics.length).toBe(result2.topics.length);
    expect(result1.summary).toBe(result2.summary);
  });
});
