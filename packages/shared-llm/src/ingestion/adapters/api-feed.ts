/**
 * FILE PURPOSE: Generic API feed ingestion — fetches JSON from third-party APIs
 * WHY: §19 — API feeds are a common input. Handles auth, retries, pagination stubs.
 *
 * Content buffer should be a JSON payload: { url, method?, headers?, body? }
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

interface ApiFeedPayload {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export class ApiFeedIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return mimeType === 'application/x-api-feed';
  }

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    let payload: ApiFeedPayload;
    try {
      payload = JSON.parse(content.toString('utf-8')) as ApiFeedPayload;
    } catch {
      process.stderr.write('WARN: ApiFeedIngester — invalid JSON payload\n');
      return null;
    }

    if (!payload.url) return null;

    try {
      const response = await fetch(payload.url, {
        method: payload.method ?? 'GET',
        headers: payload.headers,
        body: payload.body ? JSON.stringify(payload.body) : undefined,
      });

      if (!response.ok) {
        process.stderr.write(`WARN: API feed returned ${response.status} for ${payload.url}\n`);
        return null;
      }

      const data = await response.json();
      const text = JSON.stringify(data, null, 2);

      return {
        text,
        sourceType: 'api',
        mimeType: 'application/json',
        contentHash: computeContentHash(text),
        metadata: {
          ...options?.metadata,
          url: payload.url,
          method: payload.method ?? 'GET',
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      process.stderr.write(`WARN: API feed fetch failed: ${err}\n`);
      return null;
    }
  }
}
