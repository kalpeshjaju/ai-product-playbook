/**
 * FILE PURPOSE: BullMQ worker definitions for ingestion pipeline
 * WHY: §19 — processes embed, enrich, dedup, re-embed, freshness, scrape jobs.
 *      Each processor is idempotent (safe to retry).
 */

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { IngestionJobData } from './jobs.js';
import { JobType } from './queue.js';
import { parseRedisConnection } from './connection.js';
import { processEmbed } from './processors/embed.js';
import { processEnrich } from './processors/enrich.js';
import { processDedupCheck } from './processors/dedup-check.js';
import { processReEmbed } from './processors/re-embed.js';
import { processFreshness } from './processors/freshness.js';
import { processScrape } from './processors/scrape.js';

type JobProcessor = (job: Job<IngestionJobData>) => Promise<void>;

const processors: Record<string, JobProcessor> = {
  [JobType.EMBED]: async (job) => {
    const result = await processEmbed(job);
    await job.log(`Embedded ${result.vectors.length} chunks with model ${result.modelId}`);
  },
  [JobType.ENRICH]: async (job) => {
    const result = await processEnrich(job);
    await job.log(`Enriched: ${result.entities.length} entities, ${result.topics.length} topics`);
  },
  [JobType.DEDUP_CHECK]: async (job) => {
    const result = await processDedupCheck(job);
    await job.log(`Dedup: isDuplicate=${result.isDuplicate}, nearDuplicate=${result.nearDuplicate}`);
  },
  [JobType.RE_EMBED]: async (job) => {
    const result = await processReEmbed(job, { chunks: [] });
    await job.log(`Re-embedded ${result.vectors.length} chunks: ${result.oldModelId} → ${result.newModelId}`);
  },
  [JobType.FRESHNESS]: async (job) => {
    const result = await processFreshness(job, { ingestedAt: null, validUntil: null });
    await job.log(`Freshness: ${result.status} (multiplier: ${result.freshnessMultiplier})`);
  },
  [JobType.SCRAPE]: async (job) => {
    const result = await processScrape(job);
    await job.log(`Scrape: ${result ? `${result.text.length} chars` : 'null (failed)'}`);
  },
};

export function createIngestionWorker(
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
