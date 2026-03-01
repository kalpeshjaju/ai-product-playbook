/**
 * FILE PURPOSE: Hash-based exact dedup
 * WHY: §19 — fast, always-on first pass. SHA-256 content hash comparison.
 */

export function isHashDuplicate(contentHash: string, existingHashes: Set<string>): boolean {
  return existingHashes.has(contentHash);
}
