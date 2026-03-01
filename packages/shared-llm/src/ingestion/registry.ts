/**
 * FILE PURPOSE: Registry that dispatches ingestion to the correct adapter by MIME type
 *
 * WHY: §19 — multiple modalities need consistent ingestion interface.
 *      Registry pattern allows adding new adapters without modifying existing code.
 */

import type { Ingester, IngestResult, IngestOptions } from './types.js';

export class IngesterRegistry {
  private ingesters: Ingester[] = [];

  register(ingester: Ingester): void {
    this.ingesters.push(ingester);
  }

  getIngester(mimeType: string): Ingester | undefined {
    return this.ingesters.find((i) => i.canHandle(mimeType));
  }

  async ingest(content: Buffer, mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    const ingester = this.getIngester(mimeType);
    if (!ingester) return null;
    return ingester.ingest(content, mimeType, options);
  }

  supportedTypes(): string[] {
    const types = new Set<string>();
    for (const ingester of this.ingesters) {
      for (const t of ingester.supportedMimeTypes()) types.add(t);
    }
    return [...types];
  }
}
