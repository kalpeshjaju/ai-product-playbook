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

  // ── Retry behavior ────────────────────────────────────────────────────────

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers();
    const successResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{ alternatives: [{ transcript: 'Retry success', confidence: 0.88 }] }],
        },
        metadata: { duration: 2.0 },
      }),
    };

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(successResponse);

    const promise = transcribeAudio(Buffer.from('audio'));
    // Advance past retry delay (500ms for first retry)
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toEqual({
      text: 'Retry success',
      confidence: 0.88,
      durationSeconds: 2.0,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on 500 then 429 then succeeds on third attempt', async () => {
    vi.useFakeTimers();
    const successResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{ alternatives: [{ transcript: 'Third time', confidence: 0.85 }] }],
        },
        metadata: { duration: 1.5 },
      }),
    };

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(successResponse);

    const promise = transcribeAudio(Buffer.from('audio'));
    await vi.advanceTimersByTimeAsync(600);  // 1st retry (500ms)
    await vi.advanceTimersByTimeAsync(1100); // 2nd retry (1000ms)
    const result = await promise;

    expect(result).toEqual({
      text: 'Third time',
      confidence: 0.85,
      durationSeconds: 1.5,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('returns null after exhausting all retries on 500', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn()
      .mockResolvedValue({ ok: false, status: 500 });

    const promise = transcribeAudio(Buffer.from('audio'));
    // Advance through all retry delays: 500 + 1000 + 2000 = 3500ms
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(result).toBeNull();
    // 1 initial + 3 retries = 4 total
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('returns null after exhausting all retries on network errors', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));

    const promise = transcribeAudio(Buffer.from('audio'));
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(result).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('does not retry on 400 (non-retryable client error)', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValue({ ok: false, status: 400 });

    const result = await transcribeAudio(Buffer.from('audio'));
    expect(result).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
