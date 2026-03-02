import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRes } from './helpers.js';

const mockQueueAdd = vi.fn();
const mockCreateIngestionQueue = vi.fn().mockReturnValue({
  add: (...args: unknown[]) => mockQueueAdd(...args),
});
const mockPersistDocument = vi.fn();
const mockSelect = vi.fn();

vi.mock('@playbook/shared-llm', () => {
  class TestIngesterRegistry {
    register(): void {}

    supportedTypes(): string[] {
      return ['text/plain'];
    }

    async ingest(rawBody: Buffer, contentType: string): Promise<{
      text: string;
      sourceType: 'document';
      mimeType: string;
      contentHash: string;
      metadata: null;
    } | null> {
      if (contentType !== 'text/plain') return null;
      return {
        text: rawBody.toString('utf8'),
        sourceType: 'document',
        mimeType: 'text/plain',
        contentHash: 'ingest-hash-1',
        metadata: null,
      };
    }
  }

  class NoopIngester {}

  return {
    IngesterRegistry: TestIngesterRegistry,
    DocumentIngester: NoopIngester,
    AudioIngester: NoopIngester,
    ImageIngester: NoopIngester,
    WebIngester: NoopIngester,
    CsvIngester: NoopIngester,
    ApiFeedIngester: NoopIngester,
    createIngestionQueue: (...args: unknown[]) => mockCreateIngestionQueue(...args),
    JobType: {
      ENRICH: 'enrich',
      DEDUP_CHECK: 'dedup-check',
    },
  };
});

vi.mock('../src/services/document-persistence.js', () => ({
  persistDocument: (...args: unknown[]) => mockPersistDocument(...args),
}));

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  documents: {
    id: 'id',
    contentHash: 'content_hash',
  },
  embeddings: {
    sourceId: 'source_id',
    modelId: 'model_id',
    embedding: 'embedding',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => [a, b],
  ne: (a: unknown, b: unknown) => [a, b, '!='],
}));

import { handleIngestRoutes } from '../src/routes/ingest.js';

function createSelectChain<T>(result: T) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function createRawReq(
  method: string,
  contentType: string,
  body: Buffer,
  title?: string,
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.headers = { 'content-type': contentType };
  if (title) req.headers['x-document-title'] = title;
  process.nextTick(() => {
    req.emit('data', body);
    req.emit('end');
  });
  return req;
}

describe('/api/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockQueueAdd.mockResolvedValue({ id: 'job-1' });
    mockPersistDocument.mockResolvedValue({
      documentId: 'doc-123',
      persisted: true,
      duplicate: false,
      chunksCreated: 3,
      embeddingsGenerated: true,
      embeddingModelId: 'text-embedding-3-small',
      contentHash: 'persisted-hash-1',
      partialFailure: false,
    });
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it('GET /api/ingest/types returns supported MIME types', async () => {
    const req = { method: 'GET', headers: {} } as IncomingMessage;
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest/types');

    expect(res._statusCode).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ supportedTypes: ['text/plain'] });
  });

  it('POST /api/ingest enqueues enrichment + dedup with real dedup context', async () => {
    mockSelect
      .mockReturnValueOnce(createSelectChain([{ contentHash: 'old-hash' }]))
      .mockReturnValueOnce(createSelectChain([{ embedding: [0.11, 0.22] }]))
      .mockReturnValueOnce(createSelectChain([{ docId: 'doc-old', embedding: [0.12, 0.23] }]));

    const req = createRawReq('POST', 'text/plain', Buffer.from('Hello ingest world'), 'My doc');
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.documentId).toBe('doc-123');
    expect(body.queued).toBe(true);
    expect(mockQueueAdd).toHaveBeenCalledTimes(2);

    const dedupCall = mockQueueAdd.mock.calls.find((call) => call[0] === 'dedup-check');
    expect(dedupCall).toBeDefined();
    const dedupJob = dedupCall?.[1] as {
      payload: {
        contentHash: string;
        embedding?: number[];
        knownHashes?: string[];
        existingEmbeddings?: Array<{ docId: string; embedding: number[] }>;
      };
    };
    expect(dedupJob.payload.embedding).toEqual([0.11, 0.22]);
    expect(dedupJob.payload.knownHashes).toEqual(['old-hash']);
    expect(dedupJob.payload.existingEmbeddings).toEqual([
      { docId: 'doc-old', embedding: [0.12, 0.23] },
    ]);
  });

  it('POST /api/ingest reports queued=false when any enqueue fails', async () => {
    mockSelect
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(createSelectChain([]))
      .mockReturnValueOnce(createSelectChain([]));

    mockQueueAdd
      .mockResolvedValueOnce({ id: 'job-enrich' })
      .mockRejectedValueOnce(new Error('queue down'));

    const req = createRawReq('POST', 'text/plain', Buffer.from('payload'));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.queued).toBe(false);
  });
});

