/**
 * Tests for semantic chunking — sentence splitting, grouping, boundary detection, assembly.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  splitIntoSentences,
  groupSentences,
  findBoundaries,
  assembleChunks,
  chunkSemanticAsync,
  chunkSemantic,
} from '../src/ingestion/chunking/semantic.js';

describe('splitIntoSentences', () => {
  it('returns empty array for empty string', () => {
    expect(splitIntoSentences('')).toEqual([]);
    expect(splitIntoSentences('   ')).toEqual([]);
  });

  it('splits on sentence-ending punctuation', () => {
    const result = splitIntoSentences('First sentence. Second sentence! Third question?');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toContain('First sentence.');
  });

  it('splits on double newlines', () => {
    const result = splitIntoSentences('Paragraph one.\n\nParagraph two.');
    expect(result.length).toBe(2);
    expect(result[0]).toContain('Paragraph one.');
    expect(result[1]).toContain('Paragraph two.');
  });

  it('splits on markdown headers', () => {
    const result = splitIntoSentences('Intro text.\n\n## Section One\n\nContent here.');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves code blocks as single units', () => {
    const text = 'Before code.\n\n```javascript\nconst a = 1;\nconst b = 2;\n```\n\nAfter code.';
    const result = splitIntoSentences(text);
    const codeChunk = result.find((s) => s.includes('const a = 1'));
    expect(codeChunk).toBeDefined();
    expect(codeChunk).toContain('const b = 2');
  });
});

describe('groupSentences', () => {
  it('groups with window=4', () => {
    const sentences = ['A', 'B', 'C', 'D', 'E', 'F'];
    const groups = groupSentences(sentences, 4);
    // 6 sentences, window 4, step 1 → 3 groups: [0..3], [1..4], [2..5]
    expect(groups).toHaveLength(3);
    expect(groups[0]).toBe('A B C D');
    expect(groups[2]).toBe('C D E F');
  });

  it('returns single group when sentences <= windowSize', () => {
    const groups = groupSentences(['A', 'B'], 4);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toBe('A B');
  });
});

describe('findBoundaries', () => {
  it('returns no boundaries for high-similarity consecutive embeddings', () => {
    // Nearly identical vectors → high similarity → no boundaries
    const vectors = [
      [1, 0, 0],
      [0.99, 0.01, 0],
      [0.98, 0.02, 0],
    ];
    expect(findBoundaries(vectors, 0.65)).toEqual([]);
  });

  it('returns boundary at low-similarity drop', () => {
    // First two similar, third orthogonal
    const vectors = [
      [1, 0, 0],
      [0.99, 0.01, 0],
      [0, 1, 0], // big similarity drop
    ];
    const boundaries = findBoundaries(vectors, 0.65);
    expect(boundaries).toContain(2);
  });

  it('returns empty array for single embedding', () => {
    expect(findBoundaries([[1, 0, 0]])).toEqual([]);
  });

  it('returns empty array for no embeddings', () => {
    expect(findBoundaries([])).toEqual([]);
  });
});

describe('assembleChunks', () => {
  it('respects chunkSize — no chunk exceeds limit', () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence ${i}. `.repeat(30));
    const boundaries = [5, 10, 15];
    const chunks = assembleChunks(sentences, boundaries, 500, 50);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it('produces chunks at boundary points', () => {
    const sentences = ['A.', 'B.', 'C.', 'D.', 'E.'];
    const boundaries = [2, 4];
    const chunks = assembleChunks(sentences, boundaries, 2000, 200);
    // Should produce 3 segments: [A,B], [C,D], [E]
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('A. B.');
    expect(chunks[1]).toBe('C. D.');
    expect(chunks[2]).toBe('E.');
  });

  it('handles empty sentences', () => {
    expect(assembleChunks([], [1, 2], 2000, 200)).toEqual([]);
  });
});

describe('chunkSemanticAsync', () => {
  it('happy path — returns semantically coherent chunks with mocked embeddings', async () => {
    const text = 'Topic A sentence one. Topic A sentence two. Topic B is different. Topic B continues here.';
    const mockEmbedFn = vi.fn().mockResolvedValue([
      [1, 0, 0],  // group containing topic A
      [0, 1, 0],  // topic shift to B
    ]);

    const chunks = await chunkSemanticAsync(text, mockEmbedFn);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(mockEmbedFn).toHaveBeenCalledOnce();
  });

  it('falls back to chunkFixed when embeddings fail', async () => {
    // Text with sentence boundaries so splitIntoSentences produces multiple entries
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} with content.`);
    const text = sentences.join(' ');
    const failingEmbedFn = vi.fn().mockResolvedValue(null);

    const chunks = await chunkSemanticAsync(text, failingEmbedFn, { chunkSize: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it('returns single-element array for single sentence', async () => {
    const text = 'Just one sentence.';
    const embedFn = vi.fn();
    const chunks = await chunkSemanticAsync(text, embedFn);
    expect(chunks).toHaveLength(1);
    // embedFn should not be called for single sentence
    expect(embedFn).not.toHaveBeenCalled();
  });
});

describe('chunkSemantic (sync backward compat)', () => {
  it('delegates to chunkFixed', () => {
    const result = chunkSemantic('short text');
    expect(result).toEqual(['short text']);
  });

  it('chunks long text via chunkFixed', () => {
    const text = 'a'.repeat(5000);
    const chunks = chunkSemantic(text, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBe(2000);
  });
});
