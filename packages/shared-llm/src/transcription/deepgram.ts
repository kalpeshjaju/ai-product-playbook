/**
 * FILE PURPOSE: Voice-to-text transcription via Deepgram REST API
 *
 * WHY: INPUT pillar — voice content must be transcribable to text for
 *      embedding and RAG pipelines.
 *
 * HOW: POSTs audio buffer to Deepgram /v1/listen endpoint.
 *      Fail-open when DEEPGRAM_API_KEY not set. No SDK dependency.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

/** Transcription result from Deepgram. */
export interface TranscriptionResult {
  text: string;
  confidence: number;
  durationSeconds: number;
}

/** Options for transcription. */
export interface TranscribeOptions {
  mimeType?: string;     // default: 'audio/wav'
  language?: string;     // default: 'en'
  model?: string;        // default: 'nova-2'
  punctuate?: boolean;   // default: true
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/** Whether the HTTP status is a transient error worth retrying. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Transcribe an audio buffer to text via Deepgram.
 * Retries up to 3 times with exponential backoff for transient failures (5xx, 429).
 * Returns null when DEEPGRAM_API_KEY not set or on permanent failure.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  options?: TranscribeOptions,
): Promise<TranscriptionResult | null> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    process.stderr.write('INFO: DEEPGRAM_API_KEY not set — transcription unavailable\n');
    return null;
  }

  const mimeType = options?.mimeType ?? 'audio/wav';
  const model = options?.model ?? 'nova-2';
  const language = options?.language ?? 'en';
  const punctuate = options?.punctuate ?? true;

  const params = new URLSearchParams({
    model,
    language,
    punctuate: String(punctuate),
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': mimeType,
        },
        body: new Uint8Array(audioBuffer),
      });

      // Permanent client error (4xx except 429) — don't retry
      if (!response.ok && !isRetryableStatus(response.status)) {
        process.stderr.write(`WARN: Deepgram API returned ${response.status} — not retryable\n`);
        return null;
      }

      // Transient error — retry with backoff
      if (!response.ok && isRetryableStatus(response.status)) {
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          process.stderr.write(`WARN: Deepgram API returned ${response.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})\n`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        process.stderr.write(`WARN: Deepgram API returned ${response.status} — all ${MAX_RETRIES} retries exhausted\n`);
        return null;
      }

      const data = await response.json() as {
        results?: {
          channels?: Array<{
            alternatives?: Array<{ transcript?: string; confidence?: number }>;
          }>;
        };
        metadata?: { duration?: number };
      };

      const alternative = data.results?.channels?.[0]?.alternatives?.[0];
      if (!alternative?.transcript) return null;

      return {
        text: alternative.transcript,
        confidence: alternative.confidence ?? 0,
        durationSeconds: data.metadata?.duration ?? 0,
      };
    } catch {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        process.stderr.write(`WARN: Deepgram network error — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})\n`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      process.stderr.write('WARN: Deepgram transcription failed after all retries — returning null\n');
      return null;
    }
  }

  return null;
}
