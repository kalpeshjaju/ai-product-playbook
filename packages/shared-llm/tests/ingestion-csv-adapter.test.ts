import { describe, it, expect } from 'vitest';
import { CsvIngester } from '../src/ingestion/adapters/csv.js';

describe('CsvIngester', () => {
  const ingester = new CsvIngester();

  it('handles CSV and Excel MIME types', () => {
    expect(ingester.canHandle('text/csv')).toBe(true);
    expect(ingester.canHandle('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    expect(ingester.canHandle('application/vnd.ms-excel')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('parses CSV content to structured text', async () => {
    const csv = 'name,age,role\nAlice,30,Engineer\nBob,25,Designer';
    const result = await ingester.ingest(Buffer.from(csv));
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Alice');
    expect(result!.text).toContain('Bob');
    expect(result!.sourceType).toBe('csv');
    expect(result!.metadata.rowCount).toBe(2);
    expect(result!.metadata.columns).toEqual(['name', 'age', 'role']);
  });

  it('returns null for empty CSV', async () => {
    const result = await ingester.ingest(Buffer.from(''));
    expect(result).toBeNull();
  });

  it('handles CSV with only headers', async () => {
    const result = await ingester.ingest(Buffer.from('name,age,role\n'));
    expect(result).toBeNull();
  });
});
