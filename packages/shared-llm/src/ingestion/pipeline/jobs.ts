/**
 * FILE PURPOSE: Job type definitions for the ingestion pipeline
 * WHY: §19 — enrichment pipeline needs typed job payloads for each async operation.
 *      Each worker gets compile-time safety via discriminated payload types.
 */

import type { JobTypeValue } from './queue.js';
import type { ChunkStrategy } from '../types.js';

/** Payload for the EMBED job — generates vector embeddings from text chunks. */
export interface EmbedPayload {
  modelId: string;
  chunks: string[];
  chunkStrategy: ChunkStrategy;
}

/** Payload for the ENRICH job — adds metadata/summaries to ingested content. */
export interface EnrichPayload {
  content: string;
  enrichments?: string[];
}

/** Payload for the DEDUP_CHECK job — detects duplicate documents by hash or embedding. */
export interface DedupCheckPayload {
  contentHash: string;
  embedding?: number[];
}

/** Payload for the RE_EMBED job — migrates embeddings from one model to another. */
export interface ReEmbedPayload {
  oldModelId: string;
  newModelId: string;
}

/** Payload for the FRESHNESS job — checks if a document is stale and needs re-ingestion. */
export interface FreshnessPayload {
  maxAgeDays?: number;
}

/** Payload for the SCRAPE job — fetches and ingests content from a URL. */
export interface ScrapePayload {
  url: string;
  metadata?: Record<string, unknown>;
}

/** Union of all ingestion job payloads — used by IngestionJobData for type safety. */
export type IngestionPayload =
  | EmbedPayload
  | EnrichPayload
  | DedupCheckPayload
  | ReEmbedPayload
  | FreshnessPayload
  | ScrapePayload;

/** Job data shape for the BullMQ ingestion queue. */
export interface IngestionJobData {
  type: JobTypeValue;
  documentId: string;
  payload: IngestionPayload;
}
