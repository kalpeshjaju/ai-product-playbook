/**
 * FILE PURPOSE: BullMQ worker factory for ingestion pipeline
 * WHY: §19 — processes embed, enrich, dedup, re-embed, freshness, scrape jobs.
 *      Accepts external processors map so apps/api can provide DB-aware implementations
 *      while shared-llm stays DB-agnostic.
 */

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { IngestionJobData } from './jobs.js';
import { parseRedisConnection } from './connection.js';

export type JobProcessor = (job: Job<IngestionJobData>) => Promise<void>;

/**
 * Create a BullMQ worker for the ingestion pipeline.
 *
 * @param processors - Map of job type → processor function. Provided by the caller
 *   (e.g. apps/api) so processors can access DB, LLM clients, etc.
 * @param redisUrl - Redis connection string (falls back to REDIS_URL env var)
 * @param concurrency - Max concurrent job processing (default: 5)
 */
export function createIngestionWorker(
  processors: Record<string, JobProcessor>,
  redisUrl?: string,
  concurrency = 5,
): Worker<IngestionJobData> {
  return new Worker<IngestionJobData>(
    'ingestion-pipeline',
    async (job) => {
      const processor = processors[job.data.type];
      if (!processor) {
        throw new Error(`Unknown job type: ${job.data.type}`);
      }
      await processor(job);
    },
    {
      connection: parseRedisConnection(redisUrl),
      concurrency,
    },
  );
}
