/**
 * FILE PURPOSE: Job type definitions for the ingestion pipeline
 * WHY: §19 — enrichment pipeline needs typed job payloads for each async operation.
 */

export interface IngestionJobData {
  type: string;
  documentId: string;
  payload: Record<string, unknown>;
}
