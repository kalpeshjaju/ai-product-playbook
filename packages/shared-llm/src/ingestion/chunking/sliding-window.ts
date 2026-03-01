/**
 * FILE PURPOSE: Sliding-window chunker with 20% overlap
 * WHY: §19 — captures cross-boundary context for transcripts, meeting notes.
 */

export function chunkSlidingWindow(text: string, windowSize = 2000): string[] {
  if (text.length <= windowSize) return [text];
  const overlapSize = Math.floor(windowSize * 0.2);
  const step = windowSize - overlapSize;
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + windowSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += step;
  }
  return chunks;
}
