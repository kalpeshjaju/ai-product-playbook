/**
 * FILE PURPOSE: Image/OCR ingestion — Tesseract (simple) + Zerox (complex)
 * WHY: §19 — tiered OCR: free local for simple text, vision LLM for complex/scanned.
 *
 * Routing:
 *   ZEROX_ENABLED=true → uses Zerox (vision LLM OCR, higher quality, costs ~$0.01-0.03/page)
 *   TESSERACT_ENABLED=true → uses tesseract.js (free, local WASM OCR)
 *   Both enabled → Zerox preferred, Tesseract fallback
 *   Neither → returns null
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff', 'image/bmp']);

export class ImageIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return IMAGE_TYPES.has(mimeType);
  }

  supportedMimeTypes(): string[] {
    return [...IMAGE_TYPES];
  }

  async ingest(content: Buffer, mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    const zeroxEnabled = process.env.ZEROX_ENABLED !== 'false' && !!process.env.ZEROX_MODEL;
    const tesseractEnabled = process.env.TESSERACT_ENABLED !== 'false';

    // Try Zerox first (higher quality)
    if (zeroxEnabled) {
      const result = await this.ingestViaZerox(content, mimeType, options);
      if (result) return result;
    }

    // Fallback to Tesseract
    if (tesseractEnabled) {
      return this.ingestViaTesseract(content, mimeType, options);
    }

    process.stderr.write('WARN: No OCR engine available — set ZEROX_MODEL or TESSERACT_ENABLED\n');
    return null;
  }

  private async ingestViaZerox(content: Buffer, mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    try {
      const { zerox } = await import('zerox');
      const model = process.env.ZEROX_MODEL ?? 'gpt-4o-mini';

      // Zerox expects a file path or URL. Write to temp file.
      const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const tmpDir = mkdtempSync(join(tmpdir(), 'zerox-'));
      const tmpFile = join(tmpDir, 'input.png');
      writeFileSync(tmpFile, content);

      try {
        const result = await zerox({
          filePath: tmpFile,
          openaiAPIKey: process.env.OPENAI_API_KEY ?? process.env.LITELLM_API_KEY,
          model,
          cleanup: true,
        });

        const text = result.pages.map((p) => p.content ?? '').join('\n\n');
        if (!text) return null;

        return {
          text,
          sourceType: 'image',
          mimeType,
          contentHash: computeContentHash(text),
          metadata: {
            ...options?.metadata,
            ocrEngine: 'zerox',
            model,
            pageCount: result.pages.length,
          },
          rawSource: content,
        };
      } finally {
        try { unlinkSync(tmpFile); } catch { /* ignore cleanup failure */ }
      }
    } catch (err) {
      process.stderr.write(`WARN: Zerox OCR failed: ${err}\n`);
      return null;
    }
  }

  private async ingestViaTesseract(content: Buffer, mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    try {
      const Tesseract = await import('tesseract.js');
      const recognize = Tesseract.default?.recognize ?? Tesseract.recognize;
      const { data } = await recognize(content, 'eng');

      if (!data.text?.trim()) return null;

      return {
        text: data.text.trim(),
        sourceType: 'image',
        mimeType,
        contentHash: computeContentHash(data.text.trim()),
        metadata: {
          ...options?.metadata,
          ocrEngine: 'tesseract',
          confidence: data.confidence,
        },
        rawSource: content,
      };
    } catch (err) {
      process.stderr.write(`WARN: Tesseract OCR failed: ${err}\n`);
      return null;
    }
  }
}
