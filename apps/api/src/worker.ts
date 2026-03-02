/**
 * FILE PURPOSE: Standalone BullMQ worker process for ingestion pipeline
 * WHY: §19 — runs separately from the HTTP server so queue processing
 *      doesn't block API requests. Start via `npm run worker`.
 *      Handles post-processing persistence (e.g. writing enrichment results to DB).
 */

import { createIngestionWorker } from '@playbook/shared-llm';
import { eq } from 'drizzle-orm';
import { db, documents } from './db/index.js';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  process.stderr.write('FATAL: REDIS_URL is required to start the worker\n');
  process.exit(1);
}

const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;

const worker = createIngestionWorker(REDIS_URL, concurrency);

worker.on('completed', (job, returnvalue) => {
  process.stderr.write(`INFO: Job ${job.id} (${job.data.type}) completed for doc ${job.data.documentId}\n`);

  if (job.data.type === 'enrich' && job.data.documentId) {
    process.stderr.write(`DEBUG: returnvalue type=${typeof returnvalue} truthy=${!!returnvalue} val=${JSON.stringify(returnvalue).slice(0, 200)}\n`);

    if (returnvalue) {
      const enrichment = typeof returnvalue === 'string' ? JSON.parse(returnvalue) as Record<string, unknown> : returnvalue as Record<string, unknown>;
      process.stderr.write(`DEBUG: enrichment keys=${Object.keys(enrichment).join(',')}\n`);
      db.update(documents)
        .set({ enrichmentStatus: enrichment })
        .where(eq(documents.id, job.data.documentId))
        .then(() => {
          process.stderr.write(`INFO: Enrichment persisted for doc ${job.data.documentId}\n`);
        })
        .catch((err: Error) => {
          process.stderr.write(`ERROR: Failed to persist enrichment for doc ${job.data.documentId}: ${err.message}\n`);
        });
    }
  }
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
