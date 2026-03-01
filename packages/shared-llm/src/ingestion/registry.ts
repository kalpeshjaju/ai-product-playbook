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
    return ingester.ingest(content, options);
  }

  supportedTypes(): string[] {
    const testTypes = [
      'text/plain', 'text/markdown', 'text/csv',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png', 'image/jpeg', 'image/webp', 'image/tiff',
      'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm',
      'application/json',
    ];
    return testTypes.filter((t) => this.ingesters.some((i) => i.canHandle(t)));
  }
}
