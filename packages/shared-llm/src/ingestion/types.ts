/**
 * FILE PURPOSE: Core types for the ingestion adapter system
 *
 * WHY: §19 Input Pillar — every modality produces the same IngestResult shape.
 *      Adapters conform to the Ingester interface for registry dispatch.
 */

import { createHash } from 'node:crypto';

/** Chunking strategies — determines how text is split before embedding. */
export type ChunkStrategy = 'fixed' | 'semantic' | 'sliding-window' | 'per-entity';

/** Source modality — typed union instead of bare string. */
export type SourceType = 'document' | 'audio' | 'image' | 'web' | 'csv' | 'api';

/** Result produced by every ingestion adapter. */
export interface IngestResult {
  text: string;
  sourceType: SourceType;
  mimeType: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  rawSource?: Buffer;
}

/** Options passed to ingestion adapters. */
export interface IngestOptions {
  chunkStrategy?: ChunkStrategy;
  modelId?: string;
  validUntil?: Date;
  metadata?: Record<string, unknown>;
}

/** Adapter interface — every modality implements this. */
export interface Ingester {
  canHandle(mimeType: string): boolean;
  supportedMimeTypes(): string[];
  ingest(content: Buffer, mimeType: string, options?: IngestOptions): Promise<IngestResult | null>;
}

/** Compute SHA-256 content hash. Shared utility for all adapters. */
export function computeContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
