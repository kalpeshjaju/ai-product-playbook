import { describe, it, expect } from 'vitest';
import { chunkFixed, chunkSlidingWindow, chunkPerEntity, chunkSemantic, selectChunker } from '../src/ingestion/chunking/index.js';
import type { ChunkStrategy } from '../src/ingestion/types.js';

describe('chunkFixed', () => {
  it('splits text into fixed-size chunks', () => {
    const text = 'a'.repeat(5000);
    const chunks = chunkFixed(text, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBe(2000);
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkFixed('short text', 2000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('short text');
  });

  it('overlap connects adjacent chunks', () => {
    const text = 'abcdefghij';
    const chunks = chunkFixed(text, 6, 2);
    // chunk0: 'abcdef', chunk1: 'efghij'
    expect(chunks[0]!.slice(-2)).toBe(chunks[1]!.slice(0, 2));
  });
});

describe('chunkSlidingWindow', () => {
  it('produces overlapping chunks with 20% overlap', () => {
    const text = 'word '.repeat(500); // ~2500 chars
    const chunks = chunkSlidingWindow(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    // Each subsequent chunk starts 200 chars before end of previous
    const overlapSize = Math.floor(1000 * 0.2);
    const end0 = chunks[0]!;
    const start1 = chunks[1]!;
    expect(end0.slice(-overlapSize)).toBe(start1.slice(0, overlapSize));
  });
});

describe('chunkPerEntity', () => {
  it('splits CSV-like text by newline', () => {
    const text = 'row1\nrow2\nrow3';
    const chunks = chunkPerEntity(text, '\n');
    expect(chunks).toEqual(['row1', 'row2', 'row3']);
  });

  it('filters empty lines', () => {
    const text = 'row1\n\nrow2\n';
    const chunks = chunkPerEntity(text, '\n');
    expect(chunks).toEqual(['row1', 'row2']);
  });
});

describe('selectChunker', () => {
  it('returns fixed chunker for "fixed" strategy', () => {
    const chunker = selectChunker('fixed');
    const result = chunker('hello world');
    expect(result).toEqual(['hello world']);
  });

  it('returns sliding-window chunker for "sliding-window"', () => {
    const chunker = selectChunker('sliding-window');
    expect(typeof chunker).toBe('function');
  });

  it('returns per-entity chunker for "per-entity"', () => {
    const chunker = selectChunker('per-entity');
    const result = chunker('a\nb\nc');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('returns semantic chunker for "semantic"', () => {
    const chunker = selectChunker('semantic');
    const result = chunker('hello');
    expect(result).toEqual(['hello']);
  });
});

describe('chunkSemantic', () => {
  it('does not split when text fits in one chunk', () => {
    const text = 'This is a short sentence. Another one here.';
    const chunks = chunkSemantic(text, 2000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('splits at sentence boundaries', () => {
    // Build text with many sentences that exceed chunkSize
    const sentence = 'This is a test sentence. ';
    const text = sentence.repeat(100); // ~2500 chars
    const chunks = chunkSemantic(text, 500, 0);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk (except possibly the last) should end with sentence-ending punctuation
    for (const chunk of chunks) {
      const trimmed = chunk.trimEnd();
      expect(trimmed).toMatch(/[.!?]$/);
    }
  });

  it('handles text with no sentence boundaries (falls back to character split)', () => {
    // Text with no periods, question marks, exclamation marks, or markdown headings
    const text = 'a'.repeat(5000);
    const chunks = chunkSemantic(text, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    // Should still produce chunks that cover the full text
    expect(chunks[0]!.length).toBeLessThanOrEqual(2000);
  });

  it('handles markdown headings as split points', () => {
    const text = [
      'Introduction paragraph with some content here.',
      '',
      '## Section Two',
      '',
      'Content for section two goes here.',
      '',
      '## Section Three',
      '',
      'Content for section three goes here.',
    ].join('\n');
    // Use a chunkSize that forces a split but large enough to hold each section
    const chunks = chunkSemantic(text, 80, 0);
    expect(chunks.length).toBeGreaterThan(1);
    // At least one chunk should start with a markdown heading
    const hasHeadingStart = chunks.some((c) => c.trimStart().startsWith('## '));
    expect(hasHeadingStart).toBe(true);
  });

  it('overlap produces chunks with shared content', () => {
    const sentences = Array.from({ length: 8 }, (_, i) =>
      `Sentence number ${i + 1} here.`
    );
    const text = sentences.join(' ');
    const chunks = chunkSemantic(text, 100, 50);
    expect(chunks.length).toBeGreaterThan(1);

    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i]!;
      const next = chunks[i + 1]!;
      // Find any sentence that appears in both chunks (overlap)
      const sharedSentence = sentences.find(
        (s) => current.includes(s) && next.includes(s)
      );
      expect(sharedSentence).toBeDefined();
    }
  });
});
