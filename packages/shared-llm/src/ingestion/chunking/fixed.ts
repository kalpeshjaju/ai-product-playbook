/**
 * FILE PURPOSE: Fixed-size text chunker with configurable overlap
 * WHY: §19 — default chunking strategy for uniform content.
 */

export function chunkFixed(text: string, chunkSize = 2000, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}
