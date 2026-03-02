/**
 * FILE PURPOSE: BullMQ worker definitions for ingestion pipeline
 * WHY: §19 — processes embed, enrich, dedup, re-embed, freshness, scrape jobs.
 *      Each processor is idempotent (safe to retry).
 *      Processors return results so the worker entry point can persist them.
 */

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { DedupCheckPayload, FreshnessPayload, IngestionJobData, ReEmbedPayload } from './jobs.js';
import { JobType } from './queue.js';
import { parseRedisConnection } from './connection.js';
import { processEmbed } from './processors/embed.js';
import { processEnrich } from './processors/enrich.js';
import { processDedupCheck } from './processors/dedup-check.js';
import { processReEmbed } from './processors/re-embed.js';
import { processFreshness } from './processors/freshness.js';
import { processScrape } from './processors/scrape.js';

type JobProcessor = (job: Job<IngestionJobData>) => Promise<unknown>;

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const processors: Record<string, JobProcessor> = {
  [JobType.EMBED]: async (job) => {
    const result = await processEmbed(job);
    await job.log(`Embedded ${result.vectors.length} chunks with model ${result.modelId}`);
    return result;
  },
  [JobType.ENRICH]: async (job) => {
    const result = await processEnrich(job);
    await job.log(`Enriched: ${result.entities.length} entities, ${result.topics.length} topics`);
    return result;
  },
  [JobType.DEDUP_CHECK]: async (job) => {
    const payload = job.data.payload as DedupCheckPayload;
    const result = await processDedupCheck(job, {
      knownHashes: payload.knownHashes ? new Set(payload.knownHashes) : undefined,
      existingEmbeddings: payload.existingEmbeddings,
    });
    await job.log(`Dedup: isDuplicate=${result.isDuplicate}, nearDuplicate=${result.nearDuplicate}`);
    return result;
  },
  [JobType.RE_EMBED]: async (job) => {
    const payload = job.data.payload as ReEmbedPayload;
    const result = await processReEmbed(job, { chunks: payload.chunks });
    await job.log(`Re-embedded ${result.vectors.length} chunks: ${result.oldModelId} → ${result.newModelId}`);
    return result;
  },
  [JobType.FRESHNESS]: async (job) => {
    const payload = job.data.payload as FreshnessPayload;
    const result = await processFreshness(job, {
      ingestedAt: parseOptionalDate(payload.ingestedAt),
      validUntil: parseOptionalDate(payload.validUntil),
    });
    await job.log(`Freshness: ${result.status} (multiplier: ${result.freshnessMultiplier})`);
    return result;
  },
  [JobType.SCRAPE]: async (job) => {
    const result = await processScrape(job);
    await job.log(`Scrape: ${result ? `${result.text.length} chars` : 'null (failed)'}`);
    return result;
  },
};

export async function processIngestionJob(job: Job<IngestionJobData>): Promise<unknown> {
  const processor = processors[job.data.type];
  if (!processor) {
    throw new Error(`Unknown job type: ${job.data.type}`);
  }
  return processor(job);
}

export function createIngestionWorker(
  redisUrl?: string,
  concurrency = 5,
): Worker<IngestionJobData> {
  return new Worker<IngestionJobData>(
    'ingestion-pipeline',
    processIngestionJob,
    {
      connection: parseRedisConnection(redisUrl),
      concurrency,
    },
  );
}
