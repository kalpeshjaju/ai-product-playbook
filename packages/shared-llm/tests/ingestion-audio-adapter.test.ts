import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioIngester } from '../src/ingestion/adapters/audio.js';

const originalFetch = globalThis.fetch;

describe('AudioIngester', () => {
  const ingester = new AudioIngester();

  beforeEach(() => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('handles audio MIME types', () => {
    expect(ingester.canHandle('audio/wav')).toBe(true);
    expect(ingester.canHandle('audio/mp3')).toBe(true);
    expect(ingester.canHandle('audio/mpeg')).toBe(true);
    expect(ingester.canHandle('audio/webm')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('returns IngestResult on successful transcription', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{
            alternatives: [{ transcript: 'Hello from audio', confidence: 0.95 }],
          }],
        },
        metadata: { duration: 5.0 },
      }),
    });

    const result = await ingester.ingest(Buffer.from('fake-audio'));
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello from audio');
    expect(result!.sourceType).toBe('audio');
    expect(result!.metadata.confidence).toBe(0.95);
    expect(result!.metadata.durationSeconds).toBe(5.0);
    expect(result!.contentHash).toHaveLength(64);
  });

  it('returns null when API key missing', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', '');
    delete process.env.DEEPGRAM_API_KEY;

    const result = await ingester.ingest(Buffer.from('audio'));
    expect(result).toBeNull();
  });

  it('passes diarize param when enabled in metadata', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: { channels: [{ alternatives: [{ transcript: 'test', confidence: 0.9 }] }] },
        metadata: { duration: 1.0 },
      }),
    });

    await ingester.ingest(Buffer.from('audio'), { metadata: { diarize: true } });
    const callUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(callUrl).toContain('diarize=true');
  });
});
