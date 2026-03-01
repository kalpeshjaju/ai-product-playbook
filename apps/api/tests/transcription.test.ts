/**
 * Tests for transcription routes (routes/transcription.ts)
 *
 * Mocks @playbook/shared-llm for transcribeAudio.
 * Uses raw body mock (Buffer events) instead of JSON body parser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── shared-llm mock ─────────────────────────────────────────────────────────
const mockTranscribeAudio = vi.fn();

vi.mock('@playbook/shared-llm', () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
  scanOutput: vi.fn().mockResolvedValue({ passed: true, findings: [], scanTimeMs: 0, scannersRun: ['regex'] }),
}));

import { handleTranscriptionRoutes } from '../src/routes/transcription.js';
import { scanOutput } from '@playbook/shared-llm';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createRawMockReq(method: string, body: Buffer): IncomingMessage {
  const req = {
    method,
    headers: { 'content-type': 'audio/wav' },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === 'data') handler(body);
      if (event === 'end') handler();
    },
  } as unknown as IncomingMessage;
  return req;
}

function createMockRes(): ServerResponse & { _body: string; _statusCode: number } {
  const res = {
    statusCode: 200,
    writableEnded: false,
    _body: '',
    _statusCode: 200,
    end(body?: string) {
      this._body = body ?? '';
      this._statusCode = this.statusCode;
      this.writableEnded = true;
    },
  } as unknown as ServerResponse & { _body: string; _statusCode: number };
  return res;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('handleTranscriptionRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // POST /api/transcribe — success
  it('POST /api/transcribe calls transcribeAudio and returns result', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    const transcriptionResult = {
      text: 'Hello world',
      confidence: 0.97,
      durationSeconds: 3.2,
    };
    mockTranscribeAudio.mockResolvedValue(transcriptionResult);

    const req = createRawMockReq('POST', audioBuffer);
    const res = createMockRes();
    await handleTranscriptionRoutes(req, res, '/api/transcribe');

    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body) as Record<string, unknown>;
    expect(body.text).toBe('Hello world');
    expect(body.confidence).toBe(0.97);
    expect(body.durationSeconds).toBe(3.2);
    expect(mockTranscribeAudio).toHaveBeenCalledWith(
      expect.any(Buffer),
      { mimeType: 'audio/wav' },
    );
  });

  // POST /api/transcribe — empty body
  it('POST /api/transcribe returns 400 for empty body', async () => {
    const emptyBuffer = Buffer.alloc(0);

    const req = createRawMockReq('POST', emptyBuffer);
    const res = createMockRes();
    await handleTranscriptionRoutes(req, res, '/api/transcribe');

    expect(res._statusCode).toBe(400);
    expect(res._body).toContain('Empty audio body');
  });

  // POST /api/transcribe — transcription fails
  it('POST /api/transcribe returns 502 when transcription fails', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribeAudio.mockResolvedValue(null);

    const req = createRawMockReq('POST', audioBuffer);
    const res = createMockRes();
    await handleTranscriptionRoutes(req, res, '/api/transcribe');

    expect(res._statusCode).toBe(502);
    expect(res._body).toContain('Transcription unavailable');
  });

  // POST /api/transcribe — guardrail blocks transcription
  it('POST /api/transcribe returns 422 when guardrail blocks output', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    mockTranscribeAudio.mockResolvedValue({
      text: 'Some blocked transcription',
      confidence: 0.9,
      durationSeconds: 2.0,
    });
    vi.mocked(scanOutput).mockResolvedValueOnce({
      passed: false,
      findings: [{ scanner: 'regex', category: 'pii_leakage', description: 'PII in transcription', severity: 'high' }],
      scanTimeMs: 1,
      scannersRun: ['regex'],
    });

    const req = createRawMockReq('POST', audioBuffer);
    const res = createMockRes();
    await handleTranscriptionRoutes(req, res, '/api/transcribe');

    expect(res._statusCode).toBe(422);
    expect(res._body).toContain('blocked by output guardrail');
  });

  // Unmatched route
  it('returns 404 for unmatched routes', async () => {
    const audioBuffer = Buffer.from('data');

    const req = createRawMockReq('GET', audioBuffer);
    const res = createMockRes();
    await handleTranscriptionRoutes(req, res, '/api/transcribe/unknown');

    expect(res._statusCode).toBe(404);
    expect(res._body).toContain('Not found');
  });
});
