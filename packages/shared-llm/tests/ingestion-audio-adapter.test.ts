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

  it('returns IngestResult when diarization metadata is present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{
            alternatives: [{
              transcript: 'Hello from audio',
              confidence: 0.95,
              words: [
                { word: 'Hello', confidence: 0.99, speaker: 0, start: 0, end: 0.5 },
                { word: 'from', confidence: 0.98, speaker: 0, start: 0.5, end: 0.8 },
                { word: 'audio', confidence: 0.97, speaker: 1, start: 0.8, end: 1.2 },
              ],
            }],
          }],
        },
        metadata: { duration: 5.0 },
      }),
    });

    const result = await ingester.ingest(Buffer.from('fake-audio'), 'audio/wav');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello from audio');
    expect(result!.sourceType).toBe('audio');
    expect(result!.metadata.confidence).toBe(0.95);
    expect(result!.metadata.hasDiarization).toBe(true);
    expect(result!.metadata.speakers).toEqual([0, 1]);
  });

  it('rejects transcript without diarization metadata (§19 HARD GATE)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{
            alternatives: [{ transcript: 'No speakers here', confidence: 0.95, words: [] }],
          }],
        },
        metadata: { duration: 2.0 },
      }),
    });

    const result = await ingester.ingest(Buffer.from('audio'), 'audio/wav');
    expect(result).toBeNull();
  });

  it('allows transcript without diarization when skipDiarization is true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{
            alternatives: [{ transcript: 'Quick note', confidence: 0.90, words: [] }],
          }],
        },
        metadata: { duration: 1.0 },
      }),
    });

    const result = await ingester.ingest(Buffer.from('audio'), 'audio/wav', { metadata: { skipDiarization: true } });
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Quick note');
  });

  it('returns null when API key missing', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', '');
    delete process.env.DEEPGRAM_API_KEY;

    const result = await ingester.ingest(Buffer.from('audio'), 'audio/wav');
    expect(result).toBeNull();
  });

  it('enables diarize by default (§19 HARD GATE)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: { channels: [{ alternatives: [{
          transcript: 'test', confidence: 0.9,
          words: [{ word: 'test', confidence: 0.9, speaker: 0, start: 0, end: 0.5 }],
        }] }] },
        metadata: { duration: 1.0 },
      }),
    });

    await ingester.ingest(Buffer.from('audio'), 'audio/wav');
    const callUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(callUrl).toContain('diarize=true');
  });

  it('skips diarize param when skipDiarization is true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: { channels: [{ alternatives: [{ transcript: 'test', confidence: 0.9, words: [] }] }] },
        metadata: { duration: 1.0 },
      }),
    });

    await ingester.ingest(Buffer.from('audio'), 'audio/wav', { metadata: { skipDiarization: true } });
    const callUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(callUrl).not.toContain('diarize=true');
  });
});
