/**
 * Unit tests for all 6 worker processors.
 * All DB and LLM calls are mocked — validates processor logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockEmbeddingsCreate = vi.fn();
const mockChatCreate = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  createLLMClient: () => ({
    embeddings: { create: mockEmbeddingsCreate },
    chat: { completions: { create: mockChatCreate } },
  }),
  costLedger: { recordCall: vi.fn() },
  routeQuery: vi.fn().mockReturnValue({ tier: 'balanced' }),
  extractJson: vi.fn().mockReturnValue({
    data: { entities: ['Acme'], topics: ['tech'], summary: 'Test summary', language: 'en' },
    strategy: 1,
  }),
  selectChunker: vi.fn().mockReturnValue((text: string) => [text]),
  cosineSimilarity: vi.fn().mockReturnValue(0.5),
  NEAR_DEDUP_THRESHOLD: 0.95,
  computeFreshnessMultiplier: vi.fn().mockReturnValue(0.9),
  WebIngester: vi.fn().mockImplementation(() => ({
    ingest: vi.fn().mockResolvedValue({
      text: 'Scraped content',
      sourceType: 'web',
      mimeType: 'text/markdown',
      contentHash: 'abc123',
      metadata: { url: 'https://example.com' },
    }),
  })),
  JobType: {
    EMBED: 'embed', ENRICH: 'enrich', DEDUP_CHECK: 'dedup-check',
    RE_EMBED: 're-embed', FRESHNESS: 'freshness', SCRAPE: 'scrape',
  },
  createIngestionQueue: vi.fn(),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  documents: { id: 'id', metadata: { _: { data: {} } } },
  embeddings: { sourceId: 'source_id', metadata: { _: { data: {} } } },
}));

vi.mock('../src/services/document-persistence.js', () => ({
  resolveEmbeddingModelId: vi.fn().mockReturnValue('text-embedding-3-small'),
  estimateTokens: vi.fn().mockReturnValue(100),
  persistDocument: vi.fn().mockResolvedValue({
    documentId: 'new-doc-id', persisted: true, duplicate: false,
    chunksCreated: 1, embeddingsGenerated: true,
    embeddingModelId: 'text-embedding-3-small', contentHash: 'hash', partialFailure: false,
  }),
  enqueuePostPersistJobs: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeJob(type: string, documentId: string, payload: Record<string, unknown> = {}) {
  return { data: { type, documentId, payload } } as unknown as import('bullmq').Job<import('@playbook/shared-llm').IngestionJobData>;
}

function setupDbChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('EMBED processor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('generates embeddings and stores them', async () => {
    const doc = { id: 'doc-1', title: 'Test', rawContent: Buffer.from('test content'), chunkStrategy: 'fixed' };
    const chain = setupDbChain([doc]);
    mockSelect.mockReturnValue(chain);
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 10 },
    });

    const { processEmbed } = await import('../src/workers/embed-processor.js');
    await processEmbed(makeJob('embed', 'doc-1'));

    expect(mockEmbeddingsCreate).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it('throws when document not found', async () => {
    const chain = setupDbChain([]);
    mockSelect.mockReturnValue(chain);

    const { processEmbed } = await import('../src/workers/embed-processor.js');
    await expect(processEmbed(makeJob('embed', 'missing'))).rejects.toThrow('Document not found');
  });

  it('skips when document has no raw content', async () => {
    const doc = { id: 'doc-1', title: 'Test', rawContent: null, chunkStrategy: 'fixed' };
    const chain = setupDbChain([doc]);
    mockSelect.mockReturnValue(chain);

    const { processEmbed } = await import('../src/workers/embed-processor.js');
    await processEmbed(makeJob('embed', 'doc-1'));
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
  });
});

describe('ENRICH processor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('extracts metadata via LLM and updates document', async () => {
    const doc = { id: 'doc-1', rawContent: Buffer.from('Some content'), metadata: {} };
    const chain = setupDbChain([doc]);
    mockSelect.mockReturnValue(chain);
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"entities":[],"topics":[],"summary":"test","language":"en"}' } }],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    });

    const { processEnrich } = await import('../src/workers/enrich-processor.js');
    await processEnrich(makeJob('enrich', 'doc-1'));

    expect(mockChatCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('handles LLM failure gracefully', async () => {
    const doc = { id: 'doc-1', rawContent: Buffer.from('content'), metadata: {} };
    const chain = setupDbChain([doc]);
    mockSelect.mockReturnValue(chain);
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    mockChatCreate.mockRejectedValue(new Error('LLM timeout'));

    const { processEnrich } = await import('../src/workers/enrich-processor.js');
    // Should not throw — updates metadata with error instead
    await processEnrich(makeJob('enrich', 'doc-1'));
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('DEDUP_CHECK processor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('flags no duplicates when similarity is low', async () => {
    const doc = { id: 'doc-1', metadata: {} };
    const selectChain = setupDbChain([doc]);

    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectChain; // document lookup
      if (callCount === 2) return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ sourceId: 'doc-1', embedding: [1, 0] }]) }) }) };
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) };
    });
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

    const { processDedupCheck } = await import('../src/workers/dedup-processor.js');
    await processDedupCheck(makeJob('dedup-check', 'doc-1'));
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('RE_EMBED processor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('re-embeds with new model', async () => {
    const doc = { id: 'doc-1', title: 'Test', rawContent: Buffer.from('content'), chunkStrategy: 'fixed' };
    const chain = setupDbChain([doc]);
    mockSelect.mockReturnValue(chain);
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.4, 0.5, 0.6] }],
      usage: { prompt_tokens: 10 },
    });

    const { processReEmbed } = await import('../src/workers/re-embed-processor.js');
    await processReEmbed(makeJob('re-embed', 'doc-1', { newModelId: 'text-embedding-3-large' }));

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-large' }),
    );
  });

  it('throws when newModelId is missing', async () => {
    const { processReEmbed } = await import('../src/workers/re-embed-processor.js');
    await expect(processReEmbed(makeJob('re-embed', 'doc-1', {}))).rejects.toThrow('Missing required payload.newModelId');
  });
});

describe('FRESHNESS processor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('computes freshness multiplier for a document', async () => {
    const doc = { id: 'doc-1', ingestedAt: new Date('2025-01-01'), metadata: {} };
    const chain = setupDbChain([doc]);
    mockSelect.mockReturnValue(chain);
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

    const { processFreshness } = await import('../src/workers/freshness-processor.js');
    await processFreshness(makeJob('freshness', 'doc-1'));
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('handles sweep mode', async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 'doc-1', ingestedAt: new Date('2025-01-01') },
        ]),
      }),
    };
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectChain;
      return setupDbChain([{ metadata: {} }]);
    });
    mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

    const { processFreshness } = await import('../src/workers/freshness-processor.js');
    await processFreshness(makeJob('freshness', '', { sweep: true }));
    // Should not throw — processes batch
  });
});

describe('SCRAPE processor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('scrapes URL and persists document', async () => {
    const { processScrape } = await import('../src/workers/scrape-processor.js');
    await processScrape(makeJob('scrape', '', { url: 'https://example.com' }));

    const { persistDocument } = await import('../src/services/document-persistence.js');
    expect(persistDocument).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: 'https://example.com', sourceType: 'web' }),
    );
  });

  it('throws when URL is missing', async () => {
    const { processScrape } = await import('../src/workers/scrape-processor.js');
    await expect(processScrape(makeJob('scrape', '', {}))).rejects.toThrow('Missing required payload.url');
  });
});
