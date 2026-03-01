/**
 * FILE PURPOSE: Sentence-boundary-aware semantic chunker
 * WHY: Section 19 — splits text at natural boundaries (sentences, markdown headings)
 *      for higher-quality retrieval compared to fixed-size character splitting.
 */

import { chunkFixed } from './fixed.js';

/** A segment is a unit of text with a flag indicating if it's a heading boundary. */
interface Segment {
  text: string;
  isHeading: boolean;
}

/**
 * Splits text into segments at natural boundaries: sentence-ending punctuation
 * (. ! ?) and markdown headings (lines starting with #).
 *
 * Each segment is either:
 * - A complete sentence (ending with . ! ?)
 * - A markdown heading line
 * - A block of text with no sentence-ending punctuation
 */
function splitAtBoundaries(text: string): Segment[] {
  const segments: Segment[] = [];

  // First, split on markdown headings. A heading is a line starting with 1-6 # followed by space.
  // We split the text so headings become their own segments.
  const blocks = text.split(/(?=^#{1,6}\s)/m);

  for (const block of blocks) {
    if (block.length === 0) continue;

    const isHeading = /^#{1,6}\s/.test(block);

    if (isHeading) {
      // The block starts with a heading. Split the heading line from the rest.
      const newlineIdx = block.indexOf('\n');
      if (newlineIdx === -1) {
        // Heading is the entire block
        segments.push({ text: block, isHeading: true });
      } else {
        // Heading line, then remaining content
        segments.push({ text: block.slice(0, newlineIdx), isHeading: true });
        const rest = block.slice(newlineIdx + 1);
        if (rest.trim().length > 0) {
          splitSentences(rest, segments);
        }
      }
    } else {
      splitSentences(block, segments);
    }
  }

  return segments;
}

/**
 * Splits a block of text into sentence-level segments.
 * Sentences end with . ! ? followed by whitespace or end-of-string.
 */
function splitSentences(text: string, out: Segment[]): void {
  // Split after sentence-ending punctuation followed by whitespace.
  // The lookbehind keeps the punctuation with its sentence.
  const parts = text.split(/(?<=[.!?])\s+/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    out.push({ text: trimmed, isHeading: false });
  }
}

/**
 * Semantic chunker: splits text at sentence boundaries and markdown headings.
 *
 * - Splits at sentence-ending punctuation (. ! ?) and markdown headings (# lines)
 * - Markdown headings always start a new chunk
 * - Falls back to character-level split (via chunkFixed) when no sentence boundaries found
 * - Supports overlap by repeating trailing sentences from the previous chunk
 * - Returns a single chunk if the entire text fits within chunkSize
 *
 * @param text - Input text to chunk
 * @param chunkSize - Maximum characters per chunk (default 2000)
 * @param overlap - Approximate overlap in characters between adjacent chunks (default 200)
 */
export function chunkSemantic(text: string, chunkSize = 2000, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text];

  const segments = splitAtBoundaries(text);

  // If we got 0 or 1 segments, there are no sentence boundaries -- fall back to fixed
  if (segments.length <= 1) {
    return chunkFixed(text, chunkSize, overlap);
  }

  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;
  // Track segment indices in the current chunk for overlap calculation
  let currentSegmentIndices: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    // Headings always force a new chunk boundary
    if (seg.isHeading && currentParts.length > 0) {
      chunks.push(currentParts.join(' ').trimEnd());
      // Calculate overlap segments for the next chunk
      const overlapParts = computeOverlapParts(segments, currentSegmentIndices, overlap);
      currentParts = overlapParts.length > 0 ? [...overlapParts, seg.text] : [seg.text];
      currentLength = currentParts.join(' ').length;
      currentSegmentIndices = overlapParts.length > 0
        ? [...computeOverlapIndices(segments, currentSegmentIndices, overlap), i]
        : [i];
      continue;
    }

    const joiner = currentParts.length > 0 ? ' ' : '';
    const candidateLength = currentLength + joiner.length + seg.text.length;

    if (candidateLength <= chunkSize) {
      currentParts.push(seg.text);
      currentLength = candidateLength;
      currentSegmentIndices.push(i);
    } else {
      // Chunk is full
      if (currentParts.length > 0) {
        chunks.push(currentParts.join(' ').trimEnd());

        // Build overlap from trailing segments of the just-finished chunk
        const overlapParts = computeOverlapParts(segments, currentSegmentIndices, overlap);
        const overlapIndices = computeOverlapIndices(segments, currentSegmentIndices, overlap);

        if (overlap > 0 && overlapParts.length > 0) {
          currentParts = [...overlapParts, seg.text];
          currentSegmentIndices = [...overlapIndices, i];
        } else {
          currentParts = [seg.text];
          currentSegmentIndices = [i];
        }
        currentLength = currentParts.join(' ').length;
      } else {
        // Single segment exceeds chunkSize -- include it as-is
        chunks.push(seg.text.trimEnd());
        currentParts = [];
        currentSegmentIndices = [];
        currentLength = 0;
      }
    }
  }

  // Push remaining content
  if (currentParts.length > 0) {
    chunks.push(currentParts.join(' ').trimEnd());
  }

  return chunks;
}

/**
 * Given the segments in the just-completed chunk, walk backwards and collect
 * trailing segment texts whose combined length is within the overlap budget.
 */
function computeOverlapParts(
  segments: Segment[],
  chunkIndices: number[],
  overlap: number,
): string[] {
  if (overlap <= 0 || chunkIndices.length === 0) return [];

  const parts: string[] = [];
  let totalLength = 0;

  for (let j = chunkIndices.length - 1; j >= 0; j--) {
    const segIdx = chunkIndices[j]!;
    const segText = segments[segIdx]!.text;
    const candidateLength = totalLength === 0
      ? segText.length
      : totalLength + 1 + segText.length; // +1 for the space joiner

    if (candidateLength > overlap && parts.length > 0) break;
    parts.unshift(segText);
    totalLength = candidateLength;
  }

  return parts;
}

/**
 * Same as computeOverlapParts but returns the segment indices instead of text.
 */
function computeOverlapIndices(
  segments: Segment[],
  chunkIndices: number[],
  overlap: number,
): number[] {
  if (overlap <= 0 || chunkIndices.length === 0) return [];

  const indices: number[] = [];
  let totalLength = 0;

  for (let j = chunkIndices.length - 1; j >= 0; j--) {
    const segIdx = chunkIndices[j]!;
    const segText = segments[segIdx]!.text;
    const candidateLength = totalLength === 0
      ? segText.length
      : totalLength + 1 + segText.length;

    if (candidateLength > overlap && indices.length > 0) break;
    indices.unshift(segIdx);
    totalLength = candidateLength;
  }

  return indices;
}
