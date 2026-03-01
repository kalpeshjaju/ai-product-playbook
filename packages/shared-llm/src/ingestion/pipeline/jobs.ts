/**
 * FILE PURPOSE: Job type definitions for the ingestion pipeline
 * WHY: §19 — enrichment pipeline needs typed job payloads for each async operation.
 */

import type { JobTypeValue } from './queue.js';

/**
 * Job data passed to the BullMQ ingestion worker.
 *
 * @field type - Which processor handles this job (embed, enrich, dedup-check, etc.)
 * @field documentId - UUID of the target document (empty string for scrape jobs creating new docs)
 * @field payload - Processor-specific data:
 *   - embed: `{ modelId?: string }` — override embedding model
 *   - enrich: `{}` — no extra fields needed
 *   - dedup-check: `{}` — no extra fields needed
 *   - re-embed: `{ newModelId: string }` — required new model ID
 *   - freshness: `{ sweep?: boolean }` — true to batch-check all docs
 *   - scrape: `{ url: string, title?: string }` — URL to scrape
 */
export interface IngestionJobData {
  type: JobTypeValue;
  documentId: string;
  payload: Record<string, unknown>;
}
