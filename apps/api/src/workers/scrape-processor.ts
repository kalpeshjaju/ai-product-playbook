/**
 * FILE PURPOSE: SCRAPE processor — ingests a URL via Crawl4AI, persists, and enqueues follow-ups
 * WHY: Async URL ingestion decouples scrape latency from the API response.
 *      Creates a new document, then enqueues enrich + dedup-check for the result.
 */

import type { Job } from 'bullmq';
import type { IngestionJobData } from '@playbook/shared-llm';
import { WebIngester } from '@playbook/shared-llm';
import { persistDocument } from '../services/document-persistence.js';

export async function processScrape(job: Job<IngestionJobData>): Promise<void> {
  const { payload } = job.data;
  const url = typeof payload.url === 'string' ? payload.url : undefined;
  if (!url) throw new Error('SCRAPE: Missing required payload.url');

  const title = typeof payload.title === 'string' ? payload.title : url;
  const ingester = new WebIngester();

  try {
    const result = await ingester.ingest(Buffer.from(url, 'utf-8'), 'text/x-uri');
    if (!result || !result.text) {
      process.stderr.write(`WARN: SCRAPE: No content returned for ${url}\n`);
      return;
    }

    const persistResult = await persistDocument({
      title,
      content: result.text,
      mimeType: result.mimeType,
      sourceUrl: url,
      sourceType: 'web',
      metadata: result.metadata,
    });

    if (persistResult.persisted) {
      process.stderr.write(`INFO: SCRAPE: ${url} → document ${persistResult.documentId}\n`);
    } else if (persistResult.duplicate) {
      process.stderr.write(`INFO: SCRAPE: ${url} — duplicate of ${persistResult.documentId}\n`);
    }
  } catch (err) {
    process.stderr.write(`WARN: SCRAPE: Failed to ingest ${url}: ${err}\n`);
  }
}
