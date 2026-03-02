/**
 * FILE PURPOSE: Standalone BullMQ worker process for ingestion pipeline
 * WHY: §19 — runs separately from the HTTP server so queue processing
 *      doesn't block API requests. Start via `npm run worker`.
 *      Handles post-processing persistence (e.g. writing enrichment results to DB).
 */

import { Worker } from 'bullmq';
import { processIngestionJob, parseRedisConnection } from '@playbook/shared-llm';
import type { IngestionJobData } from '@playbook/shared-llm';
import { eq } from 'drizzle-orm';
import { db, documents } from './db/index.js';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  process.stderr.write('FATAL: REDIS_URL is required to start the worker\n');
  process.exit(1);
}

const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;

const worker = new Worker<IngestionJobData>(
  'ingestion-pipeline',
  async (job) => {
    const result = await processIngestionJob(job);

    // Persist enrichment results to DB (awaited — not fire-and-forget)
    if (job.data.type === 'enrich' && result && job.data.documentId) {
      const enrichment = result as Record<string, unknown>;
      const [updated] = await db
        .update(documents)
        .set({ enrichmentStatus: enrichment })
        .where(eq(documents.id, job.data.documentId))
        .returning({ id: documents.id });

      if (updated) {
        process.stderr.write(`INFO: Enrichment persisted for doc ${job.data.documentId}\n`);
      } else {
        process.stderr.write(`WARN: Enrichment update matched 0 rows for doc ${job.data.documentId}\n`);
      }
    }

    return result;
  },
  {
    connection: parseRedisConnection(REDIS_URL),
    concurrency,
  },
);

worker.on('completed', (job) => {
  process.stderr.write(`INFO: Job ${job.id} (${job.data.type}) completed for doc ${job.data.documentId}\n`);
});

worker.on('failed', (job, err) => {
  process.stderr.write(`ERROR: Job ${job?.id} (${job?.data.type}) failed: ${err.message}\n`);
});

worker.on('error', (err) => {
  process.stderr.write(`ERROR: Worker error: ${err.message}\n`);
});

process.stderr.write(`INFO: Ingestion worker started (concurrency=${concurrency})\n`);

async function shutdown(): Promise<void> {
  process.stderr.write('INFO: Shutting down worker…\n');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
