/**
 * FILE PURPOSE: Job type definitions for the ingestion pipeline
 * WHY: §19 — enrichment pipeline needs typed job payloads for each async operation.
 */

import type { JobTypeValue } from './queue.js';

export interface IngestionJobData {
  type: JobTypeValue;
  documentId: string;
  payload: Record<string, unknown>;
}
