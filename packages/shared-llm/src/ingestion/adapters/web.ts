/**
 * FILE PURPOSE: Web scraping adapter via Crawl4AI microservice
 * WHY: §19 — URL ingestion with JS rendering and clean markdown output.
 *      Calls the self-hosted Crawl4AI service (services/crawl4ai/) via REST.
 *      Replaces Firecrawl to eliminate external API cost.
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

const DEFAULT_CRAWL4AI_URL = 'http://localhost:8000';

export class WebIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return mimeType === 'text/x-uri';
  }

  supportedMimeTypes(): string[] {
    return ['text/x-uri'];
  }

  async ingest(content: Buffer, _mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    const baseUrl = process.env.CRAWL4AI_URL ?? DEFAULT_CRAWL4AI_URL;
    const url = content.toString('utf-8').trim();

    try {
      const response = await fetch(`${baseUrl}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        process.stderr.write(`WARN: Crawl4AI service returned ${response.status}\n`);
        return null;
      }

      const json = await response.json() as {
        success: boolean;
        markdown: string;
        metadata: Record<string, unknown>;
      };

      if (!json.success || !json.markdown) return null;

      return {
        text: json.markdown,
        sourceType: 'web',
        mimeType: 'text/markdown',
        contentHash: computeContentHash(json.markdown),
        metadata: {
          ...options?.metadata,
          url,
          scrapedAt: new Date().toISOString(),
          ...json.metadata,
        },
      };
    } catch (err) {
      process.stderr.write(`WARN: Crawl4AI scrape failed: ${err}\n`);
      return null;
    }
  }
}
