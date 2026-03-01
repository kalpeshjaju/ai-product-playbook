/**
 * FILE PURPOSE: CSV and Excel ingestion adapter
 * WHY: §19 — structured data (CSV/Excel) is a common input modality.
 *      Papa Parse for CSV, SheetJS for Excel. Outputs structured text.
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

const CSV_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export class CsvIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return CSV_TYPES.has(mimeType);
  }

  supportedMimeTypes(): string[] {
    return [...CSV_TYPES];
  }

  async ingest(content: Buffer, _mimeType: string, options?: IngestOptions): Promise<IngestResult | null> {
    const mimeType = this.detectType(content);

    if (mimeType === 'text/csv') {
      return this.parseCsv(content, options);
    }

    return this.parseExcel(content, options);
  }

  private detectType(content: Buffer): string {
    // Excel files start with PK (ZIP) magic bytes
    if (content.length >= 2 && content[0] === 0x50 && content[1] === 0x4b) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'text/csv';
  }

  private async parseCsv(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    try {
      const Papa = await import('papaparse');
      const parse = Papa.default?.parse ?? Papa.parse;
      const text = content.toString('utf-8');
      const parsed = parse(text, { header: true, skipEmptyLines: true });

      if (!parsed.data || (parsed.data as unknown[]).length === 0) return null;

      const rows = parsed.data as Record<string, unknown>[];
      const columns = parsed.meta?.fields ?? Object.keys(rows[0] ?? {});
      const textOutput = rows.map((row) => columns.map((col) => `${col}: ${row[col]}`).join(', ')).join('\n');

      return {
        text: textOutput,
        sourceType: 'csv',
        mimeType: 'text/csv',
        contentHash: computeContentHash(textOutput),
        metadata: {
          ...options?.metadata,
          rowCount: rows.length,
          columns,
        },
        rawSource: content,
      };
    } catch (err) {
      process.stderr.write(`WARN: CSV parse failed: ${err}\n`);
      return null;
    }
  }

  private async parseExcel(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    try {
      const XLSX = await import('xlsx');
      const read = XLSX.default?.read ?? XLSX.read;
      const utils = XLSX.default?.utils ?? XLSX.utils;

      const workbook = read(content, { type: 'buffer' });
      const allText: string[] = [];
      let totalRows = 0;
      const allColumns: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]!;
        const rows = utils.sheet_to_json<Record<string, unknown>>(sheet);
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0] ?? {});
        allColumns.push(...columns);
        totalRows += rows.length;

        const sheetText = rows.map((row) => columns.map((col) => `${col}: ${row[col]}`).join(', ')).join('\n');
        allText.push(`[Sheet: ${sheetName}]\n${sheetText}`);
      }

      if (totalRows === 0) return null;

      const textOutput = allText.join('\n\n');
      return {
        text: textOutput,
        sourceType: 'csv',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentHash: computeContentHash(textOutput),
        metadata: {
          ...options?.metadata,
          rowCount: totalRows,
          columns: [...new Set(allColumns)],
          sheetCount: workbook.SheetNames.length,
        },
        rawSource: content,
      };
    } catch (err) {
      process.stderr.write(`WARN: Excel parse failed: ${err}\n`);
      return null;
    }
  }
}
