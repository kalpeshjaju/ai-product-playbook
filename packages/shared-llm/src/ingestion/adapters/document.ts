/**
 * FILE PURPOSE: Document ingestion adapter — wraps existing parseDocument()
 * WHY: §19 — documents (PDF, DOCX, text, markdown) conform to Ingester interface.
 */

import { parseDocument, isSupportedMimeType } from '../../parsing/index.js';
import type { SupportedMimeType } from '../../parsing/index.js';
import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

export class DocumentIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return isSupportedMimeType(mimeType);
  }

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    // Detect MIME type from content if possible, default to text/plain
    const mimeType = this.detectMimeType(content);
    const parsed = await parseDocument(content, mimeType);
    if (!parsed) return null;

    return {
      text: parsed.text,
      sourceType: 'document',
      mimeType: parsed.mimeType,
      contentHash: computeContentHash(parsed.text),
      metadata: {
        ...options?.metadata,
        ...(parsed.pageCount ? { pageCount: parsed.pageCount } : {}),
        ...(parsed.metadata ?? {}),
      },
      rawSource: content,
    };
  }

  private detectMimeType(content: Buffer): SupportedMimeType {
    // PDF magic bytes: %PDF
    if (content.length >= 4 && content[0] === 0x25 && content[1] === 0x50 && content[2] === 0x44 && content[3] === 0x46) {
      return 'application/pdf';
    }
    // DOCX magic bytes: PK (ZIP)
    if (content.length >= 2 && content[0] === 0x50 && content[1] === 0x4b) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    // Check for markdown indicators
    const text = content.toString('utf-8', 0, Math.min(500, content.length));
    if (text.startsWith('#') || text.includes('\n## ') || text.includes('\n- ')) {
      return 'text/markdown';
    }
    return 'text/plain';
  }
}
