/**
 * Unit tests for DocumentPersistenceService utility functions.
 * Tests chunkText and resolveEmbeddingModelId — the pure logic extracted from documents.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@playbook/shared-llm', () => ({
  createLLMClient: vi.fn(),
  costLedger: { recordCall: vi.fn() },
  routeQuery: vi.fn().mockReturnValue({ tier: 'balanced' }),
}));

vi.mock('../src/db/index.js', () => ({
  db: {},
  documents: {},
  embeddings: {},
}));

import { chunkText, resolveEmbeddingModelId, estimateTokens } from '../src/services/document-persistence.js';

describe('chunkText', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello world', 2000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world');
  });

  it('splits text into overlapping chunks', () => {
    const text = 'a'.repeat(5000);
    const chunks = chunkText(text, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be <= chunkSize
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    // Reconstruct: all characters covered
    const combined = new Set<number>();
    let start = 0;
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        combined.add(start + i);
      }
      if (chunk.length === 2000) {
        start += 2000 - 200;
      }
    }
    expect(combined.size).toBe(5000);
  });

  it('handles custom chunk size and overlap', () => {
    const text = 'a'.repeat(100);
    const chunks = chunkText(text, 30, 10);
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk is exactly 30 chars
    expect(chunks[0]!.length).toBe(30);
  });

  it('handles empty text', () => {
    const chunks = chunkText('', 2000, 200);
    expect(chunks).toHaveLength(0);
  });
});

describe('resolveEmbeddingModelId', () => {
  it('returns requested model if provided', () => {
    expect(resolveEmbeddingModelId('any content', 'custom-model')).toBe('custom-model');
  });

  it('returns default model from tier routing when no model specified', () => {
    const result = resolveEmbeddingModelId('some content');
    expect(result).toBe('text-embedding-3-small');
  });

  it('ignores empty string model', () => {
    const result = resolveEmbeddingModelId('content', '');
    expect(result).toBe('text-embedding-3-small');
  });
});

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens(400)).toBe(100);
  });

  it('returns minimum 1 for small inputs', () => {
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(0)).toBe(1);
  });
});
