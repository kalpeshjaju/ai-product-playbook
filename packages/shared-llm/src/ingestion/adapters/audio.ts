/**
 * FILE PURPOSE: Audio ingestion adapter — wraps Deepgram transcription
 * WHY: §19 — voice is a first-class input. Supports diarization + custom vocabulary.
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

const AUDIO_TYPES = new Set(['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/flac']);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class AudioIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return AUDIO_TYPES.has(mimeType);
  }

  supportedMimeTypes(): string[] {
    return [...AUDIO_TYPES];
  }

  async ingest(content: Buffer, mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      process.stderr.write('INFO: DEEPGRAM_API_KEY not set — audio ingestion unavailable\n');
      return null;
    }

    const diarize = options?.metadata?.diarize === true;
    const keywords = options?.metadata?.keywords as string[] | undefined;

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en',
      punctuate: 'true',
      ...(diarize ? { diarize: 'true' } : {}),
    });

    if (keywords?.length) {
      for (const kw of keywords) {
        params.append('keywords', kw);
      }
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': mimeType,
          },
          body: new Uint8Array(content),
        });

        if (!response.ok && !isRetryableStatus(response.status)) return null;

        if (!response.ok && isRetryableStatus(response.status)) {
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
            continue;
          }
          return null;
        }

        const data = await response.json() as {
          results?: {
            channels?: Array<{
              alternatives?: Array<{
                transcript?: string;
                confidence?: number;
                words?: Array<{ word: string; confidence: number; speaker?: number; start: number; end: number }>;
              }>;
            }>;
          };
          metadata?: { duration?: number };
        };

        const alt = data.results?.channels?.[0]?.alternatives?.[0];
        if (!alt?.transcript) return null;

        return {
          text: alt.transcript,
          sourceType: 'audio',
          mimeType,
          contentHash: computeContentHash(alt.transcript),
          metadata: {
            ...options?.metadata,
            confidence: alt.confidence ?? 0,
            durationSeconds: data.metadata?.duration ?? 0,
            wordCount: alt.words?.length ?? 0,
            speakers: diarize ? [...new Set(alt.words?.map((w) => w.speaker).filter((s) => s !== undefined))] : undefined,
          },
          rawSource: content,
        };
      } catch {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
          continue;
        }
        return null;
      }
    }

    return null;
  }
}
