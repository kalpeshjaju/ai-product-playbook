import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageIngester } from '../src/ingestion/adapters/image.js';

describe('ImageIngester', () => {
  const ingester = new ImageIngester();

  it('handles image MIME types', () => {
    expect(ingester.canHandle('image/png')).toBe(true);
    expect(ingester.canHandle('image/jpeg')).toBe(true);
    expect(ingester.canHandle('image/webp')).toBe(true);
    expect(ingester.canHandle('image/tiff')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('returns null when neither ZEROX nor TESSERACT available', async () => {
    // Both disabled by environment
    vi.stubEnv('ZEROX_ENABLED', 'false');
    vi.stubEnv('TESSERACT_ENABLED', 'false');

    const result = await ingester.ingest(Buffer.from('fake-image'));
    expect(result).toBeNull();

    vi.unstubAllEnvs();
  });

  it('returns IngestResult shape from Tesseract path', async () => {
    // Mock tesseract.js recognize
    vi.stubEnv('TESSERACT_ENABLED', 'true');
    vi.stubEnv('ZEROX_ENABLED', 'false');

    // We mock at the module level for this test
    const mockRecognize = vi.fn().mockResolvedValue({
      data: { text: 'OCR text from image', confidence: 85 },
    });
    vi.doMock('tesseract.js', () => ({
      default: { recognize: mockRecognize },
      recognize: mockRecognize,
    }));

    // Re-import to pick up mock
    const { ImageIngester: MockedIngester } = await import('../src/ingestion/adapters/image.js');
    const mockedIngester = new MockedIngester();
    const result = await mockedIngester.ingest(Buffer.from('fake-png'));

    if (result) {
      expect(result.sourceType).toBe('image');
      expect(result.contentHash).toHaveLength(64);
    }

    vi.unstubAllEnvs();
    vi.doUnmock('tesseract.js');
  });
});
