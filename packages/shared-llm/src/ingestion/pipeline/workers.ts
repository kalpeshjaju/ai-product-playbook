/**
 * FILE PURPOSE: BullMQ worker definitions for ingestion pipeline
 * WHY: §19 — processes embed, enrich, dedup, re-embed, freshness, scrape jobs.
 *      Each processor is idempotent (safe to retry).
 */

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { IngestionJobData } from './jobs.js';
import { JobType } from './queue.js';

type JobProcessor = (job: Job<IngestionJobData>) => Promise<void>;

const processors: Record<string, JobProcessor> = {
  [JobType.EMBED]: async (job) => {
    // TODO: Generate embeddings for document chunks
    process.stderr.write(`INFO: Processing embed job for ${job.data.documentId}\n`);
  },
  [JobType.ENRICH]: async (job) => {
    // TODO: Run enrichment graph (entity extraction, linking)
    process.stderr.write(`INFO: Processing enrich job for ${job.data.documentId}\n`);
  },
  [JobType.DEDUP_CHECK]: async (job) => {
    // TODO: Near-dedup + entity-dedup
    process.stderr.write(`INFO: Processing dedup-check job for ${job.data.documentId}\n`);
  },
  [JobType.RE_EMBED]: async (job) => {
    // TODO: Re-generate embeddings with new model
    process.stderr.write(`INFO: Processing re-embed job for ${job.data.documentId}\n`);
  },
  [JobType.FRESHNESS]: async (job) => {
    // TODO: Check valid_until, demote stale docs
    process.stderr.write(`INFO: Processing freshness job for ${job.data.documentId}\n`);
  },
  [JobType.SCRAPE]: async (job) => {
    // TODO: Firecrawl scrape + ingest
    process.stderr.write(`INFO: Processing scrape job for ${job.data.documentId}\n`);
  },
};

export function createIngestionWorker(
  redisUrl?: string,
  concurrency = 5,
): Worker<IngestionJobData> {
  const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);

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
      connection: {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
      },
      concurrency,
    },
  );
}
