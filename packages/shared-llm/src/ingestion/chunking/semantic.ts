/**
 * FILE PURPOSE: Semantic chunker — stub, falls back to fixed
 * WHY: §19 — planned for reports/manuals. Needs LLM boundary detection.
 *      Stub for breadth scaffolding; implementation deferred.
 */

import { chunkFixed } from './fixed.js';

export function chunkSemantic(text: string, chunkSize = 2000, overlap = 200): string[] {
  // TODO: Replace with LLM-based boundary detection
  return chunkFixed(text, chunkSize, overlap);
}
