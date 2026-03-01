/**
 * FILE PURPOSE: Web scraping adapter via Firecrawl API
 * WHY: §19 — URL ingestion with JS rendering and clean markdown output.
 *      Uses Firecrawl's /v1/scrape endpoint (REST, no SDK).
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

export class WebIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return mimeType === 'text/x-uri';
  }

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      process.stderr.write('INFO: FIRECRAWL_API_KEY not set — web ingestion unavailable\n');
      return null;
    }

    const url = content.toString('utf-8').trim();

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
        }),
      });

      if (!response.ok) {
        process.stderr.write(`WARN: Firecrawl API returned ${response.status}\n`);
        return null;
      }

      const json = await response.json() as {
        success: boolean;
        data?: { markdown?: string; metadata?: Record<string, unknown> };
      };

      if (!json.success || !json.data?.markdown) return null;

      return {
        text: json.data.markdown,
        sourceType: 'web',
        mimeType: 'text/markdown',
        contentHash: computeContentHash(json.data.markdown),
        metadata: {
          ...options?.metadata,
          url,
          scrapedAt: new Date().toISOString(),
          ...json.data.metadata,
        },
      };
    } catch (err) {
      process.stderr.write(`WARN: Firecrawl scrape failed: ${err}\n`);
      return null;
    }
  }
}
