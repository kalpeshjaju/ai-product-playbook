import { describe, it, expect } from 'vitest';
import { extractJson } from '../src/json-extractor.js';

describe('extractJson', () => {
  it('parses clean JSON directly (strategy 5 — full text)', () => {
    const input = '{"key": "value", "count": 42}';
    const result = extractJson(input);
    expect(result.data).toEqual({ key: 'value', count: 42 });
  });

  it('extracts from markdown code block (strategy 2)', () => {
    const input = 'Here is the result:\n```json\n{"summary": "hello"}\n```\nDone.';
    const result = extractJson(input);
    expect(result.data).toEqual({ summary: 'hello' });
    expect(result.strategy).toBeLessThanOrEqual(3);
  });

  it('extracts from sentinel envelope (strategy 1)', () => {
    const input = 'Some preamble\nJSON_OUTPUT_START\n{"score": 0.95}\nJSON_OUTPUT_END\nSome postscript';
    const result = extractJson(input);
    expect(result.data).toEqual({ score: 0.95 });
    expect(result.strategy).toBe(1);
  });

  it('handles nested objects with balanced brace matching', () => {
    const input = 'Result: {"outer": {"inner": {"deep": true}}, "list": [1, 2, 3]}';
    const result = extractJson(input);
    expect((result.data as Record<string, unknown>).outer).toEqual({ inner: { deep: true } });
    expect((result.data as Record<string, unknown>).list).toEqual([1, 2, 3]);
  });

  it('repairs trailing commas', () => {
    const input = '{"name": "test", "value": 123,}';
    const result = extractJson(input);
    expect(result.data).toEqual({ name: 'test', value: 123 });
  });

  it('repairs JSON with single-line comments', () => {
    const input = '{"key": "value" // this is a comment\n}';
    const result = extractJson(input);
    expect((result.data as Record<string, unknown>).key).toBe('value');
  });

  it('throws for text with no JSON at all', () => {
    const input = 'This is just plain text with no JSON content whatsoever.';
    expect(() => extractJson(input)).toThrow('Unable to find JSON');
  });

  it('handles greedy match when balanced match fails on truncated JSON', () => {
    // Greedy match picks first { to last }
    const input = 'Prefix text {"a": 1} some middle text {"b": 2} suffix';
    const result = extractJson(input);
    // Should find JSON successfully (either balanced or greedy)
    expect(result.data).toBeDefined();
  });
});
