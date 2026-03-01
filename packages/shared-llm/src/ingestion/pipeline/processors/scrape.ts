/**
 * FILE PURPOSE: SCRAPE worker processor — scrapes a URL via Crawl4AI
 * WHY: §19 — web content ingestion via self-hosted Crawl4AI service.
 *      Returns IngestResult for downstream embed/enrich/dedup workers.
 */

import type { Job } from 'bullmq';
import type { IngestionJobData, ScrapePayload } from '../jobs.js';
import type { IngestResult } from '../../types.js';
import { computeContentHash } from '../../types.js';

const DEFAULT_CRAWL4AI_URL = 'http://localhost:8000';

export async function processScrape(
  job: Job<IngestionJobData>,
): Promise<IngestResult | null> {
  const { documentId } = job.data;
  const payload = job.data.payload as ScrapePayload;
  const { url, metadata: extraMetadata } = payload;

  const baseUrl = process.env.CRAWL4AI_URL ?? DEFAULT_CRAWL4AI_URL;

  try {
    const response = await fetch(`${baseUrl}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      await job.log(`WARN: Crawl4AI returned ${response.status} for ${url}`);
      return null;
    }

    const json = await response.json() as {
      success: boolean;
      markdown: string;
      metadata: Record<string, unknown>;
    };

    if (!json.success || !json.markdown) {
      await job.log(`WARN: Crawl4AI returned empty content for ${url}`);
      return null;
    }

    await job.log(`Scraped ${url} for doc ${documentId} (${json.markdown.length} chars)`);

    return {
      text: json.markdown,
      sourceType: 'web',
      mimeType: 'text/markdown',
      contentHash: computeContentHash(json.markdown),
      metadata: {
        ...extraMetadata,
        url,
        scrapedAt: new Date().toISOString(),
        ...json.metadata,
      },
    };
  } catch (err) {
    await job.log(`WARN: Crawl4AI scrape failed for ${url}: ${err}`);
    return null;
  }
}
