/**
 * Tests for Unstructured.io document parser (parsing/document-parser.ts)
 *
 * Mocks global fetch to test all code paths without hitting Unstructured API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDocument, isSupportedMimeType } from '../src/parsing/document-parser.js';
import type { SupportedMimeType } from '../src/parsing/document-parser.js';

const originalFetch = globalThis.fetch;

describe('isSupportedMimeType', () => {
  it('returns true for supported types', () => {
    expect(isSupportedMimeType('application/pdf')).toBe(true);
    expect(isSupportedMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(isSupportedMimeType('text/plain')).toBe(true);
    expect(isSupportedMimeType('text/markdown')).toBe(true);
  });

  it('returns false for unsupported types', () => {
    expect(isSupportedMimeType('image/png')).toBe(false);
    expect(isSupportedMimeType('application/json')).toBe(false);
    expect(isSupportedMimeType('video/mp4')).toBe(false);
    expect(isSupportedMimeType('')).toBe(false);
  });
});

describe('parseDocument', () => {
  beforeEach(() => {
    vi.stubEnv('UNSTRUCTURED_API_KEY', 'test-key');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('decodes text/plain directly without API call', async () => {
    const content = Buffer.from('Hello, world!');
    const result = await parseDocument(content, 'text/plain');

    expect(result).toEqual({
      text: 'Hello, world!',
      mimeType: 'text/plain',
    });
  });

  it('decodes text/markdown directly without API call', async () => {
    const content = Buffer.from('# Heading\n\nParagraph text.');
    const result = await parseDocument(content, 'text/markdown');

    expect(result).toEqual({
      text: '# Heading\n\nParagraph text.',
      mimeType: 'text/markdown',
    });
  });

  it('parses PDF via Unstructured API', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { text: 'Page one content', metadata: { page_number: 1 } },
        { text: 'Page two content', metadata: { page_number: 2 } },
      ]),
    });

    const result = await parseDocument(Buffer.from('fake-pdf'), 'application/pdf');
    expect(result).toEqual({
      text: 'Page one content\n\nPage two content',
      mimeType: 'application/pdf',
      pageCount: 2,
    });
  });

  it('returns null when UNSTRUCTURED_API_KEY is not set for binary formats', async () => {
    vi.stubEnv('UNSTRUCTURED_API_KEY', '');
    delete process.env.UNSTRUCTURED_API_KEY;

    const result = await parseDocument(Buffer.from('pdf-data'), 'application/pdf');
    expect(result).toBeNull();
  });

  it('returns null on API error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await parseDocument(Buffer.from('pdf-data'), 'application/pdf');
    expect(result).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await parseDocument(
      Buffer.from('pdf-data'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as SupportedMimeType,
    );
    expect(result).toBeNull();
  });

  it('handles elements without page_number metadata', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { text: 'Content without pages' },
      ]),
    });

    const result = await parseDocument(Buffer.from('pdf'), 'application/pdf');
    expect(result).toEqual({
      text: 'Content without pages',
      mimeType: 'application/pdf',
    });
    expect(result?.pageCount).toBeUndefined();
  });
});
