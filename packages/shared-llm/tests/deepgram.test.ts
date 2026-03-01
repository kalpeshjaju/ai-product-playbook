/**
 * Tests for Deepgram transcription wrapper (transcription/deepgram.ts)
 *
 * Mocks global fetch to test all code paths without hitting Deepgram API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudio } from '../src/transcription/deepgram.js';

const originalFetch = globalThis.fetch;

describe('transcribeAudio', () => {
  beforeEach(() => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('returns transcription result on successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{
            alternatives: [{ transcript: 'Hello world', confidence: 0.95 }],
          }],
        },
        metadata: { duration: 3.5 },
      }),
    });

    const result = await transcribeAudio(Buffer.from('fake-audio'));
    expect(result).toEqual({
      text: 'Hello world',
      confidence: 0.95,
      durationSeconds: 3.5,
    });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(callArgs[0]).toContain('https://api.deepgram.com/v1/listen');
  });

  it('returns null when DEEPGRAM_API_KEY is not set', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', '');
    delete process.env.DEEPGRAM_API_KEY;

    const result = await transcribeAudio(Buffer.from('audio'));
    expect(result).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await transcribeAudio(Buffer.from('audio'));
    expect(result).toBeNull();
  });

  it('returns null on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    const result = await transcribeAudio(Buffer.from('audio'));
    expect(result).toBeNull();
  });

  it('returns null when response has no transcript', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: { channels: [{ alternatives: [{}] }] },
        metadata: {},
      }),
    });

    const result = await transcribeAudio(Buffer.from('audio'));
    expect(result).toBeNull();
  });

  it('passes custom options to Deepgram', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{ alternatives: [{ transcript: 'Test', confidence: 0.9 }] }],
        },
        metadata: { duration: 1.0 },
      }),
    });

    await transcribeAudio(Buffer.from('audio'), {
      mimeType: 'audio/mp3',
      language: 'es',
      model: 'whisper-large',
    });

    const callUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(callUrl).toContain('model=whisper-large');
    expect(callUrl).toContain('language=es');
  });
});
