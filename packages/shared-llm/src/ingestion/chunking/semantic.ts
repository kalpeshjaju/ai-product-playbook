/**
 * FILE PURPOSE: Semantic chunker — splits text at natural topic boundaries
 * WHY: §19 — for reports/manuals, fixed-size chunks break mid-sentence.
 *      Sentence-boundary + embedding similarity detects topic shifts.
 *      `chunkSemantic()` (sync) stays backward-compat; `chunkSemanticAsync()` is the real impl.
 */

import { chunkFixed } from './fixed.js';

// ─── Sentence splitting ─────────────────────────────────────────────────────

const CODE_BLOCK_RE = /```[\s\S]*?```/g;

/**
 * Split text into sentences at `.!?`, double newlines, and markdown headers.
 * Preserves fenced code blocks as single units.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];

  // Extract code blocks, replace with placeholders
  const codeBlocks: string[] = [];
  const withPlaceholders = text.replace(CODE_BLOCK_RE, (match) => {
    codeBlocks.push(match);
    return `\x00CODE_BLOCK_${codeBlocks.length - 1}\x00`;
  });

  // Split on sentence-ending punctuation, double newlines, or markdown headers
  const rawParts = withPlaceholders.split(
    /(?<=[.!?])\s+(?=[A-Z\d])|\n{2,}|(?=^#{1,6}\s)/m,
  );

  // Restore code blocks and filter empties
  return rawParts
    .map((part) =>
      part.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_, idx) => codeBlocks[Number(idx)] ?? ''),
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ─── Sliding window grouping ────────────────────────────────────────────────

/** Group consecutive sentences into overlapping windows for embedding comparison. */
export function groupSentences(sentences: string[], windowSize = 4): string[] {
  if (sentences.length <= windowSize) return [sentences.join(' ')];

  const groups: string[] = [];
  for (let i = 0; i <= sentences.length - windowSize; i++) {
    groups.push(sentences.slice(i, i + windowSize).join(' '));
  }
  return groups;
}

// ─── Boundary detection via cosine similarity ───────────────────────────────

/**
 * Find topic boundaries where consecutive embedding windows diverge.
 * Returns indices (in the groups array) where a split should occur.
 */
export function findBoundaries(
  embeddingVectors: number[][],
  threshold = 0.65,
): number[] {
  const boundaries: number[] = [];
  for (let i = 1; i < embeddingVectors.length; i++) {
    const sim = cosineSim(embeddingVectors[i - 1]!, embeddingVectors[i]!);
    if (sim < threshold) {
      boundaries.push(i);
    }
  }
  return boundaries;
}

/** Inline cosine similarity — avoids circular import from dedup module. */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Chunk assembly ─────────────────────────────────────────────────────────

/**
 * Merge sentences into chunks at detected boundaries, respecting max size.
 * Oversized segments fall back to chunkFixed.
 */
export function assembleChunks(
  sentences: string[],
  boundaries: number[],
  chunkSize = 2000,
  overlap = 200,
): string[] {
  // Convert group-level boundary indices to sentence-level split points
  const splitPoints = [0, ...boundaries, sentences.length];
  const segments: string[] = [];

  for (let i = 0; i < splitPoints.length - 1; i++) {
    const start = splitPoints[i]!;
    const end = splitPoints[i + 1]!;
    segments.push(sentences.slice(start, end).join(' '));
  }

  // Split oversized segments via chunkFixed; drop empty segments
  const result: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0) continue;
    if (segment.length > chunkSize) {
      result.push(...chunkFixed(segment, chunkSize, overlap));
    } else {
      result.push(segment);
    }
  }

  return result;
}

// ─── Async semantic chunking (real implementation) ──────────────────────────

export interface SemanticChunkOptions {
  chunkSize?: number;
  overlap?: number;
  windowSize?: number;
  similarityThreshold?: number;
  modelId?: string;
}

/**
 * Semantic chunking via sentence-boundary detection + embedding similarity.
 * Falls back to chunkFixed when embeddings are unavailable.
 *
 * @param text - Raw text to chunk
 * @param embedFn - Function that embeds an array of strings → array of vectors (or null on failure)
 * @param options - Chunking configuration
 */
export async function chunkSemanticAsync(
  text: string,
  embedFn: (inputs: string[]) => Promise<number[][] | null>,
  options?: SemanticChunkOptions,
): Promise<string[]> {
  const {
    chunkSize = 2000,
    overlap = 200,
    windowSize = 4,
    similarityThreshold = 0.65,
  } = options ?? {};

  // 1. Split into sentences
  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) {
    return sentences.length === 0 ? [] : [sentences[0]!];
  }

  // 2. Group sentences into sliding windows
  const groups = groupSentences(sentences, windowSize);

  // 3. Embed groups — fail-open to chunkFixed
  const vectors = await embedFn(groups);
  if (!vectors || vectors.length === 0) {
    return chunkFixed(text, chunkSize, overlap);
  }

  // 4. Detect topic boundaries
  const boundaries = findBoundaries(vectors, similarityThreshold);

  // 5. Assemble chunks at boundaries
  return assembleChunks(sentences, boundaries, chunkSize, overlap);
}

// ─── Sync fallback (backward compat for selectChunker) ──────────────────────

/** Sync semantic chunker — falls back to chunkFixed. Used by selectChunker. */
export function chunkSemantic(text: string, chunkSize = 2000, overlap = 200): string[] {
  return chunkFixed(text, chunkSize, overlap);
}
