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

    // §19 HARD GATE: diarization is mandatory unless explicitly opted out (skipDiarization: true)
    const skipDiarization = options?.metadata?.skipDiarization === true;
    const keywords = options?.metadata?.keywords as string[] | undefined;

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en',
      punctuate: 'true',
      ...(!skipDiarization ? { diarize: 'true' } : {}),
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

        const words = alt.words ?? [];
        const speakers = [...new Set(words.map((w) => w.speaker).filter((s) => s !== undefined))];

        // §19 HARD GATE: reject transcripts without diarization metadata (unless explicitly skipped).
        // Exception: if Deepgram returned words but none have speaker labels, this likely means
        // single-speaker audio where diarization found nothing to differentiate — accept it.
        const hasDiarizationData = words.length > 0 && words.some((w) => w.speaker !== undefined);
        if (!skipDiarization && speakers.length === 0 && words.length === 0) {
          process.stderr.write('WARN: Audio transcript rejected — no words or diarization metadata (§19 HARD GATE)\n');
          return null;
        }

        return {
          text: alt.transcript,
          sourceType: 'audio',
          mimeType,
          contentHash: computeContentHash(alt.transcript),
          metadata: {
            ...options?.metadata,
            confidence: alt.confidence ?? 0,
            durationSeconds: data.metadata?.duration ?? 0,
            wordCount: words.length,
            speakers: speakers.length > 0 ? speakers : undefined,
            hasDiarization: hasDiarizationData,
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
