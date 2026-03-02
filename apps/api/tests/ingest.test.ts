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

  it('POST /api/ingest returns 400 when Content-Type is missing', async () => {
    const req = createRawReq('POST', '', Buffer.from('payload'));
    // Overwrite content-type to empty
    req.headers = {};
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(400);
    expect(JSON.parse(res._body)).toEqual({ error: 'Content-Type header required' });
  });

  it('POST /api/ingest returns 400 for empty body', async () => {
    const req = createRawReq('POST', 'text/plain', Buffer.alloc(0));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(400);
    expect(JSON.parse(res._body)).toEqual({ error: 'Empty body' });
  });

  it('POST /api/ingest returns 422 for unsupported Content-Type', async () => {
    const req = createRawReq('POST', 'application/x-unsupported', Buffer.from('payload'));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(422);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.error).toContain('Unsupported or failed ingestion');
    expect(body.supportedTypes).toBeDefined();
  });

  it('POST /api/ingest returns 207 on partial failure (persist but no embeddings)', async () => {
    mockPersistDocument.mockResolvedValue({
      ...defaultPersistResult,
      embeddingsGenerated: false,
      partialFailure: true,
    });

    const req = createRawReq('POST', 'text/plain', Buffer.from('partial'));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(207);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.persisted).toBe(true);
    expect(body.embeddingsGenerated).toBe(false);
  });

  it('POST /api/ingest returns 500 when persistDocument throws', async () => {
    mockPersistDocument.mockRejectedValue(new Error('DB connection lost'));

    const req = createRawReq('POST', 'text/plain', Buffer.from('payload'));
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest');

    expect(res._statusCode).toBe(500);
    expect(JSON.parse(res._body)).toEqual({ error: 'Internal server error' });
  });

  it('returns 404 for unknown route', async () => {
    const req = { method: 'GET', headers: {} } as IncomingMessage;
    const res = createMockRes();

    await handleIngestRoutes(req, res, '/api/ingest/unknown');

    expect(res._statusCode).toBe(404);
    expect(JSON.parse(res._body)).toEqual({ error: 'Not found' });
  });
});
