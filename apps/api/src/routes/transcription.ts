/**
 * FILE PURPOSE: Voice transcription API route
 *
 * WHY: INPUT pillar — accept audio and return transcribed text.
 *      Optionally ingest the transcription as a document for embedding.
 *
 * HOW: Reads raw audio body, calls Deepgram via shared-llm wrapper.
 *      If ?ingest=true, chains into document creation pipeline.
 *
 * Routes:
 *   POST /api/transcribe — transcribe audio, optionally ingest as document
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { transcribeAudio, scanOutput } from '@playbook/shared-llm';
const guardrailFailureMode = (process.env.LLAMAGUARD_FAILURE_MODE
  ?? (process.env.NODE_ENV === 'production' ? 'closed' : 'open')) as 'closed' | 'open';

/** Read raw body as Buffer (not JSON). */
function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

export async function handleTranscriptionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<void> {
  const parsedUrl = new URL(url, 'http://localhost');

  // POST /api/transcribe
  if (parsedUrl.pathname === '/api/transcribe' && req.method === 'POST') {
    const audioBuffer = await readRawBody(req);

    if (audioBuffer.length === 0) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Empty audio body' }));
      return;
    }

    const mimeType = typeof req.headers['content-type'] === 'string'
      ? req.headers['content-type']
      : 'audio/wav';

    const result = await transcribeAudio(audioBuffer, { mimeType });

    if (!result) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: 'Transcription unavailable — DEEPGRAM_API_KEY may not be set' }));
      return;
    }

    // Guardrail: scan model-generated transcription before returning (§21)
    const guard = await scanOutput(result.text, {
      enableLlamaGuard: true,
      failureMode: guardrailFailureMode,
    });
    if (!guard.passed) {
      res.statusCode = 422;
      res.end(JSON.stringify({
        error: 'Transcription blocked by output guardrail',
        findings: guard.findings,
      }));
      return;
    }

    res.end(JSON.stringify({
      text: result.text,
      confidence: result.confidence,
      durationSeconds: result.durationSeconds,
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}
