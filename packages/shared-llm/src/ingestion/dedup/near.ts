/**
 * FILE PURPOSE: Near-dedup via cosine similarity on embedding vectors
 * WHY: §19 — catches semantically identical content with different formatting.
 *      Threshold: > 0.95 = likely duplicate.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
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

export const NEAR_DEDUP_THRESHOLD = 0.95;

export interface NearDedupResult {
  isDuplicate: boolean;
  similarDocId?: string;
  similarity: number;
}
