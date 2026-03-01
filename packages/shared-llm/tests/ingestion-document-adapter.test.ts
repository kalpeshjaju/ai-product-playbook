import { describe, it, expect } from 'vitest';
import { DocumentIngester } from '../src/ingestion/adapters/document.js';

describe('DocumentIngester', () => {
  const ingester = new DocumentIngester();

  it('handles text/plain', () => {
    expect(ingester.canHandle('text/plain')).toBe(true);
  });

  it('handles application/pdf', () => {
    expect(ingester.canHandle('application/pdf')).toBe(true);
  });

  it('handles text/markdown', () => {
    expect(ingester.canHandle('text/markdown')).toBe(true);
  });

  it('does not handle image/png', () => {
    expect(ingester.canHandle('image/png')).toBe(false);
  });

  it('ingests plain text with correct IngestResult shape', async () => {
    const result = await ingester.ingest(Buffer.from('Hello world'), { metadata: { source: 'test' } });
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello world');
    expect(result!.sourceType).toBe('document');
    expect(result!.mimeType).toBe('text/plain');
    expect(result!.contentHash).toHaveLength(64); // SHA-256 hex
    expect(result!.metadata.source).toBe('test');
  });

  it('ingests markdown', async () => {
    const result = await ingester.ingest(Buffer.from('# Title\n\nBody'), { metadata: {} });
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('text/markdown');
    expect(result!.text).toContain('# Title');
  });

  it('preserves rawSource when option is set', async () => {
    const buf = Buffer.from('hello');
    const result = await ingester.ingest(buf, { metadata: {} });
    expect(result!.rawSource).toEqual(buf);
  });
});
