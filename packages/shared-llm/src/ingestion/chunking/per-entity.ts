/**
 * FILE PURPOSE: Per-entity chunker — one record per chunk
 * WHY: §19 — for CSV rows, job listings, profiles. Each entity = one chunk.
 */

export function chunkPerEntity(text: string, delimiter = '\n'): string[] {
  return text.split(delimiter).map((s) => s.trim()).filter(Boolean);
}
