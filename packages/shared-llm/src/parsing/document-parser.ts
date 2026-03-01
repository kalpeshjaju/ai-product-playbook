/**
 * FILE PURPOSE: Parse PDF, DOCX, and plain text documents to raw text
 *
 * WHY: INPUT pillar — binary document formats must be converted to plain text
 *      before chunking and embedding. Uses Unstructured.io API for binary formats.
 *
 * HOW: Delegates to Unstructured.io API for PDF/DOCX. Falls back to direct
 *      Buffer decode for text/markdown. Fail-open: returns null on parse failure.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

/** Successfully parsed document content. */
export interface ParsedDocument {
  text: string;
  mimeType: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
}

/** Mime types supported by the parser. */
export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/plain'
  | 'text/markdown';

const SUPPORTED_TYPES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

/** Type guard for supported mime types. */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_TYPES.has(mimeType);
}

/**
 * Parse a document buffer to plain text.
 *
 * For text/plain and text/markdown: decodes buffer directly.
 * For PDF and DOCX: POSTs to Unstructured.io API.
 * Returns null on any failure (fail-open).
 */
export async function parseDocument(
  content: Buffer,
  mimeType: SupportedMimeType,
): Promise<ParsedDocument | null> {
  try {
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return { text: content.toString('utf-8'), mimeType };
    }

    // PDF and DOCX: delegate to Unstructured.io API
    const apiUrl = process.env.UNSTRUCTURED_API_URL ?? 'https://api.unstructured.io/general/v0/general';
    const apiKey = process.env.UNSTRUCTURED_API_KEY;

    if (!apiKey) {
      process.stderr.write('WARN: UNSTRUCTURED_API_KEY not set — binary document parsing unavailable\n');
      return null;
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(content)], { type: mimeType });
    const filename = mimeType === 'application/pdf' ? 'document.pdf' : 'document.docx';
    formData.append('files', blob, filename);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'unstructured-api-key': apiKey },
      body: formData,
    });

    if (!response.ok) {
      process.stderr.write(`WARN: Unstructured API returned ${response.status}\n`);
      return null;
    }

    const elements = await response.json() as Array<{ text: string; metadata?: Record<string, unknown> }>;
    const text = elements.map((el) => el.text).join('\n\n');
    const pageNumbers = elements
      .map((el) => (el.metadata as Record<string, unknown> | undefined)?.page_number)
      .filter((p): p is number => typeof p === 'number');
    const pageCount = pageNumbers.length > 0 ? Math.max(...pageNumbers) : undefined;

    return { text, mimeType, pageCount };
  } catch {
    process.stderr.write('WARN: Document parsing failed — returning null (fail-open)\n');
    return null;
  }
}
