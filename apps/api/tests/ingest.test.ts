import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRes } from './helpers.js';

const mockQueueAdd = vi.fn();
const mockCreateIngestionQueue = vi.fn().mockReturnValue({
  add: (...args: unknown[]) => mockQueueAdd(...args),
});
const mockPersistDocument = vi.fn();

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

import { handleIngestRoutes } from '../src/routes/ingest.js';

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

const defaultPersistResult = {
  documentId: 'doc-123',
  persisted: true,
  duplicate: false,
  chunksCreated: 3,
  embeddingsGenerated: true,
  embeddingModelId: 'text-embedding-3-small',
  contentHash: 'persisted-hash-1',
  partialFailure: false,
};

describe('/api/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueAdd.mockResolvedValue({ id: 'job-1' });
    mockPersistDocument.mockResolvedValue(defaultPersistResult);
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

  // This test must run BEFORE any test that sets REDIS_URL, because
  // getQueue() caches the queue at module level once created.
  it('POST /api/ingest returns queued=false when no REDIS_URL', async () => {
    const req = createRawReq('POST', 'text/plain', Buffer.from('payload'));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.queued).toBe(false);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('POST /api/ingest persists and enqueues fire-and-forget jobs', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const req = createRawReq('POST', 'text/plain', Buffer.from('Hello ingest world'), 'My doc');
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.documentId).toBe('doc-123');
    expect(body.queued).toBe(true);

    // Fire-and-forget enqueues happen async — flush microtasks
    await vi.waitFor(() => {
      expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    });

    const enrichCall = mockQueueAdd.mock.calls.find((call) => call[0] === 'enrich');
    expect(enrichCall).toBeDefined();
    expect((enrichCall?.[1] as { payload: { content: string } }).payload.content).toBe('Hello ingest world');

    const dedupCall = mockQueueAdd.mock.calls.find((call) => call[0] === 'dedup-check');
    expect(dedupCall).toBeDefined();
    expect((dedupCall?.[1] as { payload: { contentHash: string } }).payload.contentHash).toBe('ingest-hash-1');
  });

  it('POST /api/ingest returns queued=true even if fire-and-forget fails later', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockQueueAdd.mockRejectedValue(new Error('queue down'));

    const req = createRawReq('POST', 'text/plain', Buffer.from('payload'));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    // Response returns immediately — queue availability, not job success
    expect(res._statusCode).toBe(201);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.queued).toBe(true);
  });
});
