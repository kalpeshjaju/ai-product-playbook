/**
 * FILE PURPOSE: BullMQ queue factory for ingestion pipeline
 * WHY: §19 — async enrichment, re-embedding, freshness checks via Redis-backed queue.
 *      Uses existing Railway Redis instance.
 */

import { Queue } from 'bullmq';
import type { IngestionJobData } from './jobs.js';

export const JobType = {
  EMBED: 'embed',
  ENRICH: 'enrich',
  DEDUP_CHECK: 'dedup-check',
  RE_EMBED: 're-embed',
  FRESHNESS: 'freshness',
  SCRAPE: 'scrape',
} as const;

export type JobTypeValue = (typeof JobType)[keyof typeof JobType];

const QUEUE_NAME = 'ingestion-pipeline';

export function createIngestionQueue(redisUrl?: string): Queue<IngestionJobData> {
  const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);

  return new Queue<IngestionJobData>(QUEUE_NAME, {
    connection: {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}
