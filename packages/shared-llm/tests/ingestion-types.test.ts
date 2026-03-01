import { describe, it, expect } from 'vitest';
import type { IngestResult, IngestOptions, Ingester, ChunkStrategy } from '../src/ingestion/types.js';

describe('ingestion types', () => {
  it('IngestResult conforms to expected shape', () => {
    const result: IngestResult = {
      text: 'hello',
      sourceType: 'document',
      mimeType: 'text/plain',
      contentHash: 'abc123',
      metadata: {},
    };
    expect(result.text).toBe('hello');
    expect(result.sourceType).toBe('document');
  });

  it('ChunkStrategy accepts valid values', () => {
    const strategies: ChunkStrategy[] = ['fixed', 'semantic', 'sliding-window', 'per-entity'];
    expect(strategies).toHaveLength(4);
  });

  it('Ingester interface is implementable', () => {
    const ingester: Ingester = {
      canHandle: (mime: string) => mime === 'text/plain',
      supportedMimeTypes: () => ['text/plain'],
      ingest: async (content: Buffer) => ({
        text: content.toString('utf-8'),
        sourceType: 'document',
        mimeType: 'text/plain',
        contentHash: 'hash',
        metadata: {},
      }),
    };
    expect(ingester.canHandle('text/plain')).toBe(true);
    expect(ingester.canHandle('image/png')).toBe(false);
    expect(ingester.supportedMimeTypes()).toEqual(['text/plain']);
  });
});
