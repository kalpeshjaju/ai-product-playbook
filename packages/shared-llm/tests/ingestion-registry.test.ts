import { describe, it, expect } from 'vitest';
import { IngesterRegistry } from '../src/ingestion/registry.js';
import type { Ingester, IngestResult } from '../src/ingestion/types.js';

function makeFakeIngester(mimeTypes: string[]): Ingester {
  return {
    canHandle: (mime) => mimeTypes.includes(mime),
    ingest: async (content) => ({
      text: content.toString('utf-8'),
      sourceType: 'test',
      mimeType: mimeTypes[0]!,
      contentHash: 'hash',
      metadata: {},
    }),
  };
}

describe('IngesterRegistry', () => {
  it('registers and retrieves an ingester by MIME type', () => {
    const registry = new IngesterRegistry();
    const ingester = makeFakeIngester(['text/plain']);
    registry.register(ingester);
    expect(registry.getIngester('text/plain')).toBe(ingester);
  });

  it('returns undefined for unregistered MIME type', () => {
    const registry = new IngesterRegistry();
    expect(registry.getIngester('video/mp4')).toBeUndefined();
  });

  it('first matching ingester wins', () => {
    const registry = new IngesterRegistry();
    const first = makeFakeIngester(['text/plain']);
    const second = makeFakeIngester(['text/plain']);
    registry.register(first);
    registry.register(second);
    expect(registry.getIngester('text/plain')).toBe(first);
  });

  it('ingest delegates to correct adapter', async () => {
    const registry = new IngesterRegistry();
    registry.register(makeFakeIngester(['text/plain']));
    registry.register(makeFakeIngester(['application/pdf']));

    const result = await registry.ingest(Buffer.from('hello'), 'text/plain');
    expect(result?.text).toBe('hello');
    expect(result?.sourceType).toBe('test');
  });

  it('ingest returns null for unhandled MIME type', async () => {
    const registry = new IngesterRegistry();
    const result = await registry.ingest(Buffer.from('data'), 'video/mp4');
    expect(result).toBeNull();
  });

  it('lists supported MIME types', () => {
    const registry = new IngesterRegistry();
    registry.register(makeFakeIngester(['text/plain', 'text/markdown']));
    registry.register(makeFakeIngester(['application/pdf']));
    const types = registry.supportedTypes();
    expect(types).toContain('text/plain');
    expect(types).toContain('application/pdf');
  });
});
