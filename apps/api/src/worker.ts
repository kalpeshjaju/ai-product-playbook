/**
 * FILE PURPOSE: Standalone BullMQ worker process for ingestion pipeline
 * WHY: Workers are CPU-heavy (embedding, LLM calls). Running them in a separate
 *      Railway service avoids degrading API latency for HTTP requests.
 *
 * USAGE: tsx src/worker.ts (dev) | node dist/worker.js (prod)
 * ENV: REDIS_URL, DATABASE_URL, LITELLM_PROXY_URL, LITELLM_API_KEY, WORKER_CONCURRENCY
 */

import { createIngestionWorker } from '@playbook/shared-llm';
import { buildProcessors } from './workers/index.js';

const concurrency = parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10);
const processors = buildProcessors();
const worker = createIngestionWorker(processors, undefined, concurrency);

worker.on('completed', (job) => {
  process.stderr.write(`INFO: Job ${job.id} (${job.data.type}) completed\n`);
});

worker.on('failed', (job, err) => {
  const jobId = job?.id ?? 'unknown';
  const jobType = job?.data?.type ?? 'unknown';
  process.stderr.write(`ERROR: Job ${jobId} (${jobType}) failed: ${err.message}\n`);
});

worker.on('error', (err) => {
  process.stderr.write(`ERROR: Worker error: ${err.message}\n`);
});

process.stderr.write(
  `INFO: Ingestion worker started (concurrency=${concurrency}, pid=${process.pid})\n`,
);

// Graceful shutdown
function shutdown(signal: string): void {
  process.stderr.write(`INFO: Received ${signal}, shutting down worker...\n`);
  worker.close().then(() => {
    process.stderr.write('INFO: Worker stopped gracefully\n');
    process.exit(0);
  }).catch((err) => {
    process.stderr.write(`ERROR: Worker shutdown failed: ${err}\n`);
    process.exit(1);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
