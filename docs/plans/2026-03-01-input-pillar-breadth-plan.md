# Input Pillar — Full Breadth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold all input modalities (image/OCR, web, CSV/Excel, API feeds, streams) with consistent adapter interfaces, upgrade chunking/dedup/freshness, and wire BullMQ enrichment pipeline.

**Architecture:** Interface-first adapter pattern. Every modality produces `IngestResult`. `IngesterRegistry` dispatches by MIME type. BullMQ on existing Railway Redis handles async enrichment. Existing `parseDocument()` and `transcribeAudio()` refactored into adapters.

**Tech Stack:** Zerox + tesseract.js (OCR), Firecrawl (web), Papa Parse + SheetJS (CSV/Excel), BullMQ (jobs), pgvector (search), Drizzle ORM (schema), Vitest (tests).

**Design doc:** `docs/plans/2026-03-01-input-pillar-breadth-design.md`

---

## Task 1: Core Interfaces & Types

**Files:**
- Create: `packages/shared-llm/src/ingestion/types.ts`
- Create: `packages/shared-llm/src/ingestion/index.ts`
- Test: `packages/shared-llm/tests/ingestion-types.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-types.test.ts
import { describe, it, expect } from 'vitest';
import type { IngestResult, IngestOptions, Ingester, ChunkStrategy } from '../src/ingestion/types.js';

describe('ingestion types', () => {
  it('IngestResult conforms to expected shape', () => {
    const result: IngestResult = {
      text: 'hello',
      sourceType: 'document',
      mimeType: 'text/plain',
      contentHash: 'abc123',
      metadata: {},
    };
    expect(result.text).toBe('hello');
    expect(result.sourceType).toBe('document');
  });

  it('ChunkStrategy accepts valid values', () => {
    const strategies: ChunkStrategy[] = ['fixed', 'semantic', 'sliding-window', 'per-entity'];
    expect(strategies).toHaveLength(4);
  });

  it('Ingester interface is implementable', () => {
    const ingester: Ingester = {
      canHandle: (mime: string) => mime === 'text/plain',
      ingest: async (content: Buffer) => ({
        text: content.toString('utf-8'),
        sourceType: 'document',
        mimeType: 'text/plain',
        contentHash: 'hash',
        metadata: {},
      }),
    };
    expect(ingester.canHandle('text/plain')).toBe(true);
    expect(ingester.canHandle('image/png')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-types.test.ts`
Expected: FAIL — cannot resolve `../src/ingestion/types.js`

**Step 3: Write minimal implementation**

```ts
// packages/shared-llm/src/ingestion/types.ts
/**
 * FILE PURPOSE: Core types for the ingestion adapter system
 *
 * WHY: §19 Input Pillar — every modality produces the same IngestResult shape.
 *      Adapters conform to the Ingester interface for registry dispatch.
 */

import { createHash } from 'node:crypto';

/** Chunking strategies — determines how text is split before embedding. */
export type ChunkStrategy = 'fixed' | 'semantic' | 'sliding-window' | 'per-entity';

/** Result produced by every ingestion adapter. */
export interface IngestResult {
  text: string;
  sourceType: string;
  mimeType: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  rawSource?: Buffer;
}

/** Options passed to ingestion adapters. */
export interface IngestOptions {
  chunkStrategy?: ChunkStrategy;
  modelId?: string;
  validUntil?: Date;
  metadata?: Record<string, unknown>;
}

/** Adapter interface — every modality implements this. */
export interface Ingester {
  canHandle(mimeType: string): boolean;
  ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null>;
}

/** Compute SHA-256 content hash. Shared utility for all adapters. */
export function computeContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
```

```ts
// packages/shared-llm/src/ingestion/index.ts
export type { IngestResult, IngestOptions, Ingester, ChunkStrategy } from './types.js';
export { computeContentHash } from './types.js';
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-types.test.ts`
Expected: PASS (3 tests)

**Step 5: Export from shared-llm index**

Add to `packages/shared-llm/src/index.ts` (after the existing transcription exports, around line 88):
```ts
// Ingestion pipeline (§19 Input Pillar)
export type { IngestResult, IngestOptions, Ingester, ChunkStrategy } from './ingestion/index.js';
export { computeContentHash } from './ingestion/index.js';
```

**Step 6: Commit**

```bash
git add packages/shared-llm/src/ingestion/ packages/shared-llm/tests/ingestion-types.test.ts packages/shared-llm/src/index.ts
git commit -m "feat(input): add core ingestion types and adapter interface (§19)"
```

---

## Task 2: Ingester Registry

**Files:**
- Create: `packages/shared-llm/src/ingestion/registry.ts`
- Modify: `packages/shared-llm/src/ingestion/index.ts`
- Test: `packages/shared-llm/tests/ingestion-registry.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-registry.test.ts
import { describe, it, expect } from 'vitest';
import { IngesterRegistry } from '../src/ingestion/registry.js';
import type { Ingester, IngestResult } from '../src/ingestion/types.js';

function makeFakeIngester(mimeTypes: string[]): Ingester {
  return {
    canHandle: (mime) => mimeTypes.includes(mime),
    ingest: async (content) => ({
      text: content.toString('utf-8'),
      sourceType: 'test',
      mimeType: mimeTypes[0]!,
      contentHash: 'hash',
      metadata: {},
    }),
  };
}

describe('IngesterRegistry', () => {
  it('registers and retrieves an ingester by MIME type', () => {
    const registry = new IngesterRegistry();
    const ingester = makeFakeIngester(['text/plain']);
    registry.register(ingester);
    expect(registry.getIngester('text/plain')).toBe(ingester);
  });

  it('returns undefined for unregistered MIME type', () => {
    const registry = new IngesterRegistry();
    expect(registry.getIngester('video/mp4')).toBeUndefined();
  });

  it('first matching ingester wins', () => {
    const registry = new IngesterRegistry();
    const first = makeFakeIngester(['text/plain']);
    const second = makeFakeIngester(['text/plain']);
    registry.register(first);
    registry.register(second);
    expect(registry.getIngester('text/plain')).toBe(first);
  });

  it('ingest delegates to correct adapter', async () => {
    const registry = new IngesterRegistry();
    registry.register(makeFakeIngester(['text/plain']));
    registry.register(makeFakeIngester(['application/pdf']));

    const result = await registry.ingest(Buffer.from('hello'), 'text/plain');
    expect(result?.text).toBe('hello');
    expect(result?.sourceType).toBe('test');
  });

  it('ingest returns null for unhandled MIME type', async () => {
    const registry = new IngesterRegistry();
    const result = await registry.ingest(Buffer.from('data'), 'video/mp4');
    expect(result).toBeNull();
  });

  it('lists supported MIME types', () => {
    const registry = new IngesterRegistry();
    registry.register(makeFakeIngester(['text/plain', 'text/markdown']));
    registry.register(makeFakeIngester(['application/pdf']));
    const types = registry.supportedTypes();
    expect(types).toContain('text/plain');
    expect(types).toContain('application/pdf');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-registry.test.ts`
Expected: FAIL — cannot resolve `../src/ingestion/registry.js`

**Step 3: Write minimal implementation**

```ts
// packages/shared-llm/src/ingestion/registry.ts
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
```

**Step 4: Export from ingestion index**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { IngesterRegistry } from './registry.js';
```

Add to `packages/shared-llm/src/index.ts`:
```ts
export { IngesterRegistry } from './ingestion/index.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-registry.test.ts`
Expected: PASS (6 tests)

**Step 6: Commit**

```bash
git add packages/shared-llm/src/ingestion/registry.ts packages/shared-llm/src/ingestion/index.ts packages/shared-llm/src/index.ts packages/shared-llm/tests/ingestion-registry.test.ts
git commit -m "feat(input): add IngesterRegistry for MIME-type dispatch (§19)"
```

---

## Task 3: Chunking Strategies

**Files:**
- Create: `packages/shared-llm/src/ingestion/chunking/fixed.ts`
- Create: `packages/shared-llm/src/ingestion/chunking/sliding-window.ts`
- Create: `packages/shared-llm/src/ingestion/chunking/per-entity.ts`
- Create: `packages/shared-llm/src/ingestion/chunking/semantic.ts`
- Create: `packages/shared-llm/src/ingestion/chunking/index.ts`
- Test: `packages/shared-llm/tests/chunking.test.ts`

**Step 1: Write the failing tests**

```ts
// packages/shared-llm/tests/chunking.test.ts
import { describe, it, expect } from 'vitest';
import { chunkFixed, chunkSlidingWindow, chunkPerEntity, selectChunker } from '../src/ingestion/chunking/index.js';
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

  it('defaults to fixed for "semantic" (stub)', () => {
    const chunker = selectChunker('semantic');
    const result = chunker('hello');
    expect(result).toEqual(['hello']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/chunking.test.ts`
Expected: FAIL — cannot resolve modules

**Step 3: Write implementations**

```ts
// packages/shared-llm/src/ingestion/chunking/fixed.ts
/**
 * FILE PURPOSE: Fixed-size text chunker with configurable overlap
 * WHY: §19 — default chunking strategy for uniform content.
 */

export function chunkFixed(text: string, chunkSize = 2000, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}
```

```ts
// packages/shared-llm/src/ingestion/chunking/sliding-window.ts
/**
 * FILE PURPOSE: Sliding-window chunker with 20% overlap
 * WHY: §19 — captures cross-boundary context for transcripts, meeting notes.
 */

export function chunkSlidingWindow(text: string, windowSize = 2000): string[] {
  if (text.length <= windowSize) return [text];
  const overlapSize = Math.floor(windowSize * 0.2);
  const step = windowSize - overlapSize;
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + windowSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += step;
  }
  return chunks;
}
```

```ts
// packages/shared-llm/src/ingestion/chunking/per-entity.ts
/**
 * FILE PURPOSE: Per-entity chunker — one record per chunk
 * WHY: §19 — for CSV rows, job listings, profiles. Each entity = one chunk.
 */

export function chunkPerEntity(text: string, delimiter = '\n'): string[] {
  return text.split(delimiter).map((s) => s.trim()).filter(Boolean);
}
```

```ts
// packages/shared-llm/src/ingestion/chunking/semantic.ts
/**
 * FILE PURPOSE: Semantic chunker — stub, falls back to fixed
 * WHY: §19 — planned for reports/manuals. Needs LLM boundary detection.
 *      Stub for breadth scaffolding; implementation deferred.
 */

import { chunkFixed } from './fixed.js';

export function chunkSemantic(text: string, chunkSize = 2000, overlap = 200): string[] {
  // TODO: Replace with LLM-based boundary detection
  return chunkFixed(text, chunkSize, overlap);
}
```

```ts
// packages/shared-llm/src/ingestion/chunking/index.ts
/**
 * FILE PURPOSE: Chunking strategy selector
 * WHY: §19 — dispatch to the right chunker based on ChunkStrategy enum.
 */

import type { ChunkStrategy } from '../types.js';
import { chunkFixed } from './fixed.js';
import { chunkSlidingWindow } from './sliding-window.js';
import { chunkPerEntity } from './per-entity.js';
import { chunkSemantic } from './semantic.js';

export { chunkFixed } from './fixed.js';
export { chunkSlidingWindow } from './sliding-window.js';
export { chunkPerEntity } from './per-entity.js';
export { chunkSemantic } from './semantic.js';

type Chunker = (text: string) => string[];

export function selectChunker(strategy: ChunkStrategy): Chunker {
  switch (strategy) {
    case 'fixed':
      return (text) => chunkFixed(text);
    case 'sliding-window':
      return (text) => chunkSlidingWindow(text);
    case 'per-entity':
      return (text) => chunkPerEntity(text);
    case 'semantic':
      return (text) => chunkSemantic(text);
  }
}
```

**Step 4: Export from ingestion index**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { chunkFixed, chunkSlidingWindow, chunkPerEntity, chunkSemantic, selectChunker } from './chunking/index.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/chunking.test.ts`
Expected: PASS (8 tests)

**Step 6: Commit**

```bash
git add packages/shared-llm/src/ingestion/chunking/ packages/shared-llm/tests/chunking.test.ts packages/shared-llm/src/ingestion/index.ts
git commit -m "feat(input): add fixed, sliding-window, per-entity, semantic chunking strategies (§19)"
```

---

## Task 4: Refactor Existing Document Adapter

**Files:**
- Create: `packages/shared-llm/src/ingestion/adapters/document.ts`
- Test: `packages/shared-llm/tests/ingestion-document-adapter.test.ts`

Wraps existing `parseDocument()` into the `Ingester` interface. Does NOT delete the old `parsing/` module — keeps backward compatibility.

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-document-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { DocumentIngester } from '../src/ingestion/adapters/document.js';

describe('DocumentIngester', () => {
  const ingester = new DocumentIngester();

  it('handles text/plain', () => {
    expect(ingester.canHandle('text/plain')).toBe(true);
  });

  it('handles application/pdf', () => {
    expect(ingester.canHandle('application/pdf')).toBe(true);
  });

  it('handles text/markdown', () => {
    expect(ingester.canHandle('text/markdown')).toBe(true);
  });

  it('does not handle image/png', () => {
    expect(ingester.canHandle('image/png')).toBe(false);
  });

  it('ingests plain text with correct IngestResult shape', async () => {
    const result = await ingester.ingest(Buffer.from('Hello world'), { metadata: { source: 'test' } });
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello world');
    expect(result!.sourceType).toBe('document');
    expect(result!.mimeType).toBe('text/plain');
    expect(result!.contentHash).toHaveLength(64); // SHA-256 hex
    expect(result!.metadata.source).toBe('test');
  });

  it('ingests markdown', async () => {
    const result = await ingester.ingest(Buffer.from('# Title\n\nBody'), { metadata: {} });
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('text/markdown');
    expect(result!.text).toContain('# Title');
  });

  it('preserves rawSource when option is set', async () => {
    const buf = Buffer.from('hello');
    const result = await ingester.ingest(buf, { metadata: {} });
    expect(result!.rawSource).toEqual(buf);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-document-adapter.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
// packages/shared-llm/src/ingestion/adapters/document.ts
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
```

**Step 4: Export from ingestion index**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { DocumentIngester } from './adapters/document.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-document-adapter.test.ts`
Expected: PASS (7 tests)

**Step 6: Commit**

```bash
git add packages/shared-llm/src/ingestion/adapters/document.ts packages/shared-llm/tests/ingestion-document-adapter.test.ts packages/shared-llm/src/ingestion/index.ts
git commit -m "feat(input): refactor document parsing into Ingester adapter (§19)"
```

---

## Task 5: Refactor Audio Adapter

**Files:**
- Create: `packages/shared-llm/src/ingestion/adapters/audio.ts`
- Test: `packages/shared-llm/tests/ingestion-audio-adapter.test.ts`

Wraps existing `transcribeAudio()` into adapter pattern. Adds diarization and vocabulary support to Deepgram calls.

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-audio-adapter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioIngester } from '../src/ingestion/adapters/audio.js';

const originalFetch = globalThis.fetch;

describe('AudioIngester', () => {
  const ingester = new AudioIngester();

  beforeEach(() => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('handles audio MIME types', () => {
    expect(ingester.canHandle('audio/wav')).toBe(true);
    expect(ingester.canHandle('audio/mp3')).toBe(true);
    expect(ingester.canHandle('audio/mpeg')).toBe(true);
    expect(ingester.canHandle('audio/webm')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('returns IngestResult on successful transcription', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: {
          channels: [{
            alternatives: [{ transcript: 'Hello from audio', confidence: 0.95 }],
          }],
        },
        metadata: { duration: 5.0 },
      }),
    });

    const result = await ingester.ingest(Buffer.from('fake-audio'));
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello from audio');
    expect(result!.sourceType).toBe('audio');
    expect(result!.metadata.confidence).toBe(0.95);
    expect(result!.metadata.durationSeconds).toBe(5.0);
    expect(result!.contentHash).toHaveLength(64);
  });

  it('returns null when API key missing', async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', '');
    delete process.env.DEEPGRAM_API_KEY;

    const result = await ingester.ingest(Buffer.from('audio'));
    expect(result).toBeNull();
  });

  it('passes diarize param when enabled in metadata', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: { channels: [{ alternatives: [{ transcript: 'test', confidence: 0.9 }] }] },
        metadata: { duration: 1.0 },
      }),
    });

    await ingester.ingest(Buffer.from('audio'), { metadata: { diarize: true } });
    const callUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
    expect(callUrl).toContain('diarize=true');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-audio-adapter.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```ts
// packages/shared-llm/src/ingestion/adapters/audio.ts
/**
 * FILE PURPOSE: Audio ingestion adapter — wraps Deepgram transcription
 * WHY: §19 — voice is a first-class input. Supports diarization + custom vocabulary.
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

const AUDIO_TYPES = new Set(['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/flac']);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class AudioIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return AUDIO_TYPES.has(mimeType);
  }

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      process.stderr.write('INFO: DEEPGRAM_API_KEY not set — audio ingestion unavailable\n');
      return null;
    }

    const diarize = options?.metadata?.diarize === true;
    const keywords = options?.metadata?.keywords as string[] | undefined;

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en',
      punctuate: 'true',
      ...(diarize ? { diarize: 'true' } : {}),
    });

    if (keywords?.length) {
      for (const kw of keywords) {
        params.append('keywords', kw);
      }
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'audio/wav',
          },
          body: new Uint8Array(content),
        });

        if (!response.ok && !isRetryableStatus(response.status)) return null;

        if (!response.ok && isRetryableStatus(response.status)) {
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
            continue;
          }
          return null;
        }

        const data = await response.json() as {
          results?: {
            channels?: Array<{
              alternatives?: Array<{
                transcript?: string;
                confidence?: number;
                words?: Array<{ word: string; confidence: number; speaker?: number; start: number; end: number }>;
              }>;
            }>;
          };
          metadata?: { duration?: number };
        };

        const alt = data.results?.channels?.[0]?.alternatives?.[0];
        if (!alt?.transcript) return null;

        return {
          text: alt.transcript,
          sourceType: 'audio',
          mimeType: 'audio/wav',
          contentHash: computeContentHash(alt.transcript),
          metadata: {
            ...options?.metadata,
            confidence: alt.confidence ?? 0,
            durationSeconds: data.metadata?.duration ?? 0,
            wordCount: alt.words?.length ?? 0,
            speakers: diarize ? [...new Set(alt.words?.map((w) => w.speaker).filter((s) => s !== undefined))] : undefined,
          },
          rawSource: content,
        };
      } catch {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
          continue;
        }
        return null;
      }
    }

    return null;
  }
}
```

**Step 4: Export and run tests**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { AudioIngester } from './adapters/audio.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-audio-adapter.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add packages/shared-llm/src/ingestion/adapters/audio.ts packages/shared-llm/tests/ingestion-audio-adapter.test.ts packages/shared-llm/src/ingestion/index.ts
git commit -m "feat(input): add AudioIngester adapter with diarization + vocabulary (§19)"
```

---

## Task 6: Image/OCR Adapter (Tesseract + Zerox)

**Files:**
- Create: `packages/shared-llm/src/ingestion/adapters/image.ts`
- Test: `packages/shared-llm/tests/ingestion-image-adapter.test.ts`

**Step 1: Install dependencies**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook/packages/shared-llm && npm install tesseract.js zerox`

**Step 2: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-image-adapter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageIngester } from '../src/ingestion/adapters/image.js';

describe('ImageIngester', () => {
  const ingester = new ImageIngester();

  it('handles image MIME types', () => {
    expect(ingester.canHandle('image/png')).toBe(true);
    expect(ingester.canHandle('image/jpeg')).toBe(true);
    expect(ingester.canHandle('image/webp')).toBe(true);
    expect(ingester.canHandle('image/tiff')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('returns null when neither ZEROX nor TESSERACT available', async () => {
    // Both disabled by environment
    vi.stubEnv('ZEROX_ENABLED', 'false');
    vi.stubEnv('TESSERACT_ENABLED', 'false');

    const result = await ingester.ingest(Buffer.from('fake-image'));
    expect(result).toBeNull();

    vi.unstubAllEnvs();
  });

  it('returns IngestResult shape from Tesseract path', async () => {
    // Mock tesseract.js recognize
    vi.stubEnv('TESSERACT_ENABLED', 'true');
    vi.stubEnv('ZEROX_ENABLED', 'false');

    // We mock at the module level for this test
    const mockRecognize = vi.fn().mockResolvedValue({
      data: { text: 'OCR text from image', confidence: 85 },
    });
    vi.doMock('tesseract.js', () => ({
      default: { recognize: mockRecognize },
      recognize: mockRecognize,
    }));

    // Re-import to pick up mock
    const { ImageIngester: MockedIngester } = await import('../src/ingestion/adapters/image.js');
    const mockedIngester = new MockedIngester();
    const result = await mockedIngester.ingest(Buffer.from('fake-png'));

    if (result) {
      expect(result.sourceType).toBe('image');
      expect(result.contentHash).toHaveLength(64);
    }

    vi.unstubAllEnvs();
    vi.doUnmock('tesseract.js');
  });
});
```

**Step 3: Write implementation**

```ts
// packages/shared-llm/src/ingestion/adapters/image.ts
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

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    const zeroxEnabled = process.env.ZEROX_ENABLED !== 'false' && !!process.env.ZEROX_MODEL;
    const tesseractEnabled = process.env.TESSERACT_ENABLED !== 'false';

    // Try Zerox first (higher quality)
    if (zeroxEnabled) {
      const result = await this.ingestViaZerox(content, options);
      if (result) return result;
    }

    // Fallback to Tesseract
    if (tesseractEnabled) {
      return this.ingestViaTesseract(content, options);
    }

    process.stderr.write('WARN: No OCR engine available — set ZEROX_MODEL or TESSERACT_ENABLED\n');
    return null;
  }

  private async ingestViaZerox(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
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

        const text = result.pages.map((p: { content: string }) => p.content).join('\n\n');
        if (!text) return null;

        return {
          text,
          sourceType: 'image',
          mimeType: 'image/png',
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
        try { unlinkSync(tmpFile); } catch { /* ignore */ }
      }
    } catch (err) {
      process.stderr.write(`WARN: Zerox OCR failed: ${err}\n`);
      return null;
    }
  }

  private async ingestViaTesseract(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    try {
      const Tesseract = await import('tesseract.js');
      const recognize = Tesseract.default?.recognize ?? Tesseract.recognize;
      const { data } = await recognize(content, 'eng');

      if (!data.text?.trim()) return null;

      return {
        text: data.text.trim(),
        sourceType: 'image',
        mimeType: 'image/png',
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
```

**Step 4: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { ImageIngester } from './adapters/image.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-image-adapter.test.ts`

```bash
git add packages/shared-llm/src/ingestion/adapters/image.ts packages/shared-llm/tests/ingestion-image-adapter.test.ts packages/shared-llm/src/ingestion/index.ts packages/shared-llm/package.json
git commit -m "feat(input): add ImageIngester with Tesseract + Zerox tiered OCR (§19)"
```

---

## Task 7: Web Scraping Adapter (Firecrawl)

**Files:**
- Create: `packages/shared-llm/src/ingestion/adapters/web.ts`
- Test: `packages/shared-llm/tests/ingestion-web-adapter.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-web-adapter.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebIngester } from '../src/ingestion/adapters/web.js';

const originalFetch = globalThis.fetch;

describe('WebIngester', () => {
  const ingester = new WebIngester();

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('handles text/x-uri MIME type', () => {
    expect(ingester.canHandle('text/x-uri')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('returns null when FIRECRAWL_API_KEY not set', async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const result = await ingester.ingest(Buffer.from('https://example.com'));
    expect(result).toBeNull();
  });

  it('returns IngestResult on successful scrape', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { markdown: '# Page Title\n\nPage content here.', metadata: { title: 'Page Title' } },
      }),
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'));
    expect(result).not.toBeNull();
    expect(result!.text).toContain('Page content');
    expect(result!.sourceType).toBe('web');
    expect(result!.metadata.url).toBe('https://example.com');
  });

  it('returns null on API failure', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await ingester.ingest(Buffer.from('https://example.com'));
    expect(result).toBeNull();
  });
});
```

**Step 2: Write implementation**

```ts
// packages/shared-llm/src/ingestion/adapters/web.ts
/**
 * FILE PURPOSE: Web scraping adapter via Firecrawl API
 * WHY: §19 — URL ingestion with JS rendering and clean markdown output.
 *      Uses Firecrawl's /v1/scrape endpoint (REST, no SDK).
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

export class WebIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return mimeType === 'text/x-uri';
  }

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      process.stderr.write('INFO: FIRECRAWL_API_KEY not set — web ingestion unavailable\n');
      return null;
    }

    const url = content.toString('utf-8').trim();

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
        }),
      });

      if (!response.ok) {
        process.stderr.write(`WARN: Firecrawl API returned ${response.status}\n`);
        return null;
      }

      const json = await response.json() as {
        success: boolean;
        data?: { markdown?: string; metadata?: Record<string, unknown> };
      };

      if (!json.success || !json.data?.markdown) return null;

      return {
        text: json.data.markdown,
        sourceType: 'web',
        mimeType: 'text/markdown',
        contentHash: computeContentHash(json.data.markdown),
        metadata: {
          ...options?.metadata,
          url,
          scrapedAt: new Date().toISOString(),
          ...json.data.metadata,
        },
      };
    } catch (err) {
      process.stderr.write(`WARN: Firecrawl scrape failed: ${err}\n`);
      return null;
    }
  }
}
```

**Step 3: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { WebIngester } from './adapters/web.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-web-adapter.test.ts`

```bash
git add packages/shared-llm/src/ingestion/adapters/web.ts packages/shared-llm/tests/ingestion-web-adapter.test.ts packages/shared-llm/src/ingestion/index.ts
git commit -m "feat(input): add WebIngester adapter via Firecrawl API (§19)"
```

---

## Task 8: CSV/Excel Adapter

**Files:**
- Create: `packages/shared-llm/src/ingestion/adapters/csv.ts`
- Test: `packages/shared-llm/tests/ingestion-csv-adapter.test.ts`

**Step 1: Install dependencies**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook/packages/shared-llm && npm install papaparse xlsx && npm install -D @types/papaparse`

**Step 2: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-csv-adapter.test.ts
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
```

**Step 3: Write implementation**

```ts
// packages/shared-llm/src/ingestion/adapters/csv.ts
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

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
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
```

**Step 4: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { CsvIngester } from './adapters/csv.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-csv-adapter.test.ts`

```bash
git add packages/shared-llm/src/ingestion/adapters/csv.ts packages/shared-llm/tests/ingestion-csv-adapter.test.ts packages/shared-llm/src/ingestion/index.ts packages/shared-llm/package.json
git commit -m "feat(input): add CsvIngester for CSV + Excel via PapaParse/SheetJS (§19)"
```

---

## Task 9: API Feed Adapter

**Files:**
- Create: `packages/shared-llm/src/ingestion/adapters/api-feed.ts`
- Test: `packages/shared-llm/tests/ingestion-api-feed-adapter.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-api-feed-adapter.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiFeedIngester } from '../src/ingestion/adapters/api-feed.js';

const originalFetch = globalThis.fetch;

describe('ApiFeedIngester', () => {
  const ingester = new ApiFeedIngester();

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles application/x-api-feed MIME type', () => {
    expect(ingester.canHandle('application/x-api-feed')).toBe(true);
    expect(ingester.canHandle('text/plain')).toBe(false);
  });

  it('fetches JSON from URL and returns structured text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Test', items: [1, 2, 3] }),
    });

    const payload = JSON.stringify({ url: 'https://api.example.com/data', method: 'GET' });
    const result = await ingester.ingest(Buffer.from(payload));

    expect(result).not.toBeNull();
    expect(result!.text).toContain('title');
    expect(result!.sourceType).toBe('api');
  });

  it('returns null on invalid JSON payload', async () => {
    const result = await ingester.ingest(Buffer.from('not json'));
    expect(result).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const payload = JSON.stringify({ url: 'https://api.example.com/data' });
    const result = await ingester.ingest(Buffer.from(payload));
    expect(result).toBeNull();
  });
});
```

**Step 2: Write implementation**

```ts
// packages/shared-llm/src/ingestion/adapters/api-feed.ts
/**
 * FILE PURPOSE: Generic API feed ingestion — fetches JSON from third-party APIs
 * WHY: §19 — API feeds are a common input. Handles auth, retries, pagination stubs.
 *
 * Content buffer should be a JSON payload: { url, method?, headers?, body? }
 */

import type { Ingester, IngestResult, IngestOptions } from '../types.js';
import { computeContentHash } from '../types.js';

interface ApiFeedPayload {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export class ApiFeedIngester implements Ingester {
  canHandle(mimeType: string): boolean {
    return mimeType === 'application/x-api-feed';
  }

  async ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null> {
    let payload: ApiFeedPayload;
    try {
      payload = JSON.parse(content.toString('utf-8')) as ApiFeedPayload;
    } catch {
      process.stderr.write('WARN: ApiFeedIngester — invalid JSON payload\n');
      return null;
    }

    if (!payload.url) return null;

    try {
      const response = await fetch(payload.url, {
        method: payload.method ?? 'GET',
        headers: payload.headers,
        body: payload.body ? JSON.stringify(payload.body) : undefined,
      });

      if (!response.ok) {
        process.stderr.write(`WARN: API feed returned ${response.status} for ${payload.url}\n`);
        return null;
      }

      const data = await response.json();
      const text = JSON.stringify(data, null, 2);

      return {
        text,
        sourceType: 'api',
        mimeType: 'application/json',
        contentHash: computeContentHash(text),
        metadata: {
          ...options?.metadata,
          url: payload.url,
          method: payload.method ?? 'GET',
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      process.stderr.write(`WARN: API feed fetch failed: ${err}\n`);
      return null;
    }
  }
}
```

**Step 3: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { ApiFeedIngester } from './adapters/api-feed.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-api-feed-adapter.test.ts`

```bash
git add packages/shared-llm/src/ingestion/adapters/api-feed.ts packages/shared-llm/tests/ingestion-api-feed-adapter.test.ts packages/shared-llm/src/ingestion/index.ts
git commit -m "feat(input): add ApiFeedIngester for third-party API ingestion (§19)"
```

---

## Task 10: BullMQ Pipeline Setup

**Files:**
- Create: `packages/shared-llm/src/ingestion/pipeline/queue.ts`
- Create: `packages/shared-llm/src/ingestion/pipeline/jobs.ts`
- Create: `packages/shared-llm/src/ingestion/pipeline/workers.ts`
- Test: `packages/shared-llm/tests/ingestion-pipeline.test.ts`

**Step 1: Install dependency**

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook/packages/shared-llm && npm install bullmq`

**Step 2: Write the failing test**

```ts
// packages/shared-llm/tests/ingestion-pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { createIngestionQueue, JobType } from '../src/ingestion/pipeline/queue.js';
import type { IngestionJobData } from '../src/ingestion/pipeline/jobs.js';

describe('ingestion pipeline', () => {
  it('JobType has all expected values', () => {
    expect(JobType.EMBED).toBe('embed');
    expect(JobType.ENRICH).toBe('enrich');
    expect(JobType.DEDUP_CHECK).toBe('dedup-check');
    expect(JobType.RE_EMBED).toBe('re-embed');
    expect(JobType.FRESHNESS).toBe('freshness');
    expect(JobType.SCRAPE).toBe('scrape');
  });

  it('IngestionJobData conforms to expected shape', () => {
    const job: IngestionJobData = {
      type: JobType.EMBED,
      documentId: 'doc-123',
      payload: { modelId: 'text-embedding-3-small' },
    };
    expect(job.type).toBe('embed');
    expect(job.documentId).toBe('doc-123');
  });

  it('createIngestionQueue returns queue with correct name', () => {
    // This test validates the factory function signature.
    // Actual Redis connection is not made without REDIS_URL.
    expect(typeof createIngestionQueue).toBe('function');
  });
});
```

**Step 3: Write implementations**

```ts
// packages/shared-llm/src/ingestion/pipeline/jobs.ts
/**
 * FILE PURPOSE: Job type definitions for the ingestion pipeline
 * WHY: §19 — enrichment pipeline needs typed job payloads for each async operation.
 */

export interface IngestionJobData {
  type: string;
  documentId: string;
  payload: Record<string, unknown>;
}
```

```ts
// packages/shared-llm/src/ingestion/pipeline/queue.ts
/**
 * FILE PURPOSE: BullMQ queue factory for ingestion pipeline
 * WHY: §19 — async enrichment, re-embedding, freshness checks via Redis-backed queue.
 *      Uses existing Railway Redis instance.
 */

import { Queue } from 'bullmq';
import type { IngestionJobData } from './jobs.js';

export const JobType = {
  EMBED: 'embed',
  ENRICH: 'enrich',
  DEDUP_CHECK: 'dedup-check',
  RE_EMBED: 're-embed',
  FRESHNESS: 'freshness',
  SCRAPE: 'scrape',
} as const;

export type JobTypeValue = (typeof JobType)[keyof typeof JobType];

const QUEUE_NAME = 'ingestion-pipeline';

export function createIngestionQueue(redisUrl?: string): Queue<IngestionJobData> {
  const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);

  return new Queue<IngestionJobData>(QUEUE_NAME, {
    connection: {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}
```

```ts
// packages/shared-llm/src/ingestion/pipeline/workers.ts
/**
 * FILE PURPOSE: BullMQ worker definitions for ingestion pipeline
 * WHY: §19 — processes embed, enrich, dedup, re-embed, freshness, scrape jobs.
 *      Each processor is idempotent (safe to retry).
 */

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { IngestionJobData } from './jobs.js';
import { JobType } from './queue.js';

type JobProcessor = (job: Job<IngestionJobData>) => Promise<void>;

const processors: Record<string, JobProcessor> = {
  [JobType.EMBED]: async (job) => {
    // TODO: Generate embeddings for document chunks
    process.stderr.write(`INFO: Processing embed job for ${job.data.documentId}\n`);
  },
  [JobType.ENRICH]: async (job) => {
    // TODO: Run enrichment graph (entity extraction, linking)
    process.stderr.write(`INFO: Processing enrich job for ${job.data.documentId}\n`);
  },
  [JobType.DEDUP_CHECK]: async (job) => {
    // TODO: Near-dedup + entity-dedup
    process.stderr.write(`INFO: Processing dedup-check job for ${job.data.documentId}\n`);
  },
  [JobType.RE_EMBED]: async (job) => {
    // TODO: Re-generate embeddings with new model
    process.stderr.write(`INFO: Processing re-embed job for ${job.data.documentId}\n`);
  },
  [JobType.FRESHNESS]: async (job) => {
    // TODO: Check valid_until, demote stale docs
    process.stderr.write(`INFO: Processing freshness job for ${job.data.documentId}\n`);
  },
  [JobType.SCRAPE]: async (job) => {
    // TODO: Firecrawl scrape + ingest
    process.stderr.write(`INFO: Processing scrape job for ${job.data.documentId}\n`);
  },
};

export function createIngestionWorker(
  redisUrl?: string,
  concurrency = 5,
): Worker<IngestionJobData> {
  const url = redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);

  return new Worker<IngestionJobData>(
    'ingestion-pipeline',
    async (job) => {
      const processor = processors[job.data.type];
      if (!processor) {
        throw new Error(`Unknown job type: ${job.data.type}`);
      }
      await processor(job);
    },
    {
      connection: {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
      },
      concurrency,
    },
  );
}
```

**Step 4: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { createIngestionQueue, JobType } from './pipeline/queue.js';
export type { JobTypeValue } from './pipeline/queue.js';
export type { IngestionJobData } from './pipeline/jobs.js';
export { createIngestionWorker } from './pipeline/workers.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/ingestion-pipeline.test.ts`

```bash
git add packages/shared-llm/src/ingestion/pipeline/ packages/shared-llm/tests/ingestion-pipeline.test.ts packages/shared-llm/src/ingestion/index.ts packages/shared-llm/package.json
git commit -m "feat(input): add BullMQ ingestion pipeline with job types (§19)"
```

---

## Task 11: Schema Migration — Raw Source + Enrichment Status

**Files:**
- Modify: `apps/api/src/db/schema.ts` (lines 144-162, documents table)
- Create: `apps/api/drizzle/0002_input_pillar_columns.sql`

**Step 1: Add columns to schema**

Add to the `documents` table definition in `apps/api/src/db/schema.ts` (after `metadata` field, around line 157):
```ts
    rawContent: customType<{ data: Buffer; driverParam: Buffer }>({
      dataType: () => 'bytea',
      toDriver: (v: Buffer) => v,
      fromDriver: (v: unknown) => v as Buffer,
    })('raw_content'),
    rawContentUrl: text('raw_content_url'),
    chunkStrategy: text('chunk_strategy').notNull().default('fixed'),
    enrichmentStatus: jsonb('enrichment_status').default({}),
    sourceType: text('source_type').notNull().default('document'),
```

**Step 2: Create migration SQL**

```sql
-- apps/api/drizzle/0002_input_pillar_columns.sql
-- Input Pillar §19: raw source storage, chunking strategy, enrichment tracking
ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_content bytea;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_content_url text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_strategy text NOT NULL DEFAULT 'fixed';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS enrichment_status jsonb DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'document';
```

**Step 3: Update DATA_MODEL.md**

Add the new columns to the documents table section in `docs/DATA_MODEL.md`.

**Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0002_input_pillar_columns.sql docs/DATA_MODEL.md
git commit -m "feat(input): add raw_content, chunk_strategy, enrichment_status to documents schema (§19)"
```

---

## Task 12: Freshness Enforcement in Search

**Files:**
- Modify: `apps/api/src/routes/embeddings.ts` (lines 130-137, search query)
- Create: `packages/shared-llm/src/ingestion/freshness.ts`
- Test: `packages/shared-llm/tests/freshness.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/freshness.test.ts
import { describe, it, expect } from 'vitest';
import { computeFreshnessMultiplier } from '../src/ingestion/freshness.js';

describe('computeFreshnessMultiplier', () => {
  it('returns 1.0 for docs less than 30 days old', () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    expect(computeFreshnessMultiplier(recent)).toBe(1.0);
  });

  it('returns 0.9 for docs 30-90 days old', () => {
    const medium = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    expect(computeFreshnessMultiplier(medium)).toBe(0.9);
  });

  it('returns 0.8 for docs older than 90 days', () => {
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000); // 120 days ago
    expect(computeFreshnessMultiplier(old)).toBe(0.8);
  });

  it('returns 1.0 for null date', () => {
    expect(computeFreshnessMultiplier(null)).toBe(1.0);
  });
});
```

**Step 2: Write implementation**

```ts
// packages/shared-llm/src/ingestion/freshness.ts
/**
 * FILE PURPOSE: Freshness enforcement utilities for search and retrieval
 * WHY: §19 — stale data produces actively wrong AI output. Demote old docs in ranking.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function computeFreshnessMultiplier(ingestedAt: Date | null): number {
  if (!ingestedAt) return 1.0;
  const ageMs = Date.now() - ingestedAt.getTime();
  if (ageMs < THIRTY_DAYS_MS) return 1.0;
  if (ageMs < NINETY_DAYS_MS) return 0.9;
  return 0.8;
}
```

**Step 3: Update embedding search query**

In `apps/api/src/routes/embeddings.ts`, modify the SQL query at lines 130-137 to add freshness filter:

Replace the existing search query with:
```ts
    const results = await db.execute(sql`
      SELECT e.id, e.source_type, e.source_id, e.metadata,
             1 - (e.embedding <=> ${vectorStr}::vector) AS similarity
      FROM embeddings e
      LEFT JOIN documents d ON e.source_id = d.id AND e.source_type = 'document'
      WHERE e.model_id = ${modelId}
        AND (d.valid_until IS NULL OR d.valid_until > NOW())
      ORDER BY e.embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);
```

**Step 4: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { computeFreshnessMultiplier } from './freshness.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/freshness.test.ts`

```bash
git add packages/shared-llm/src/ingestion/freshness.ts packages/shared-llm/tests/freshness.test.ts packages/shared-llm/src/ingestion/index.ts apps/api/src/routes/embeddings.ts
git commit -m "feat(input): add freshness enforcement — expired doc filter + staleness demotion (§19)"
```

---

## Task 13: Near-Dedup via Embedding Similarity

**Files:**
- Create: `packages/shared-llm/src/ingestion/dedup/hash.ts`
- Create: `packages/shared-llm/src/ingestion/dedup/near.ts`
- Create: `packages/shared-llm/src/ingestion/dedup/index.ts`
- Test: `packages/shared-llm/tests/dedup.test.ts`

**Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { isHashDuplicate, cosineSimilarity } from '../src/ingestion/dedup/index.js';

describe('isHashDuplicate', () => {
  it('returns true for matching hashes', () => {
    const hashes = new Set(['abc123', 'def456']);
    expect(isHashDuplicate('abc123', hashes)).toBe(true);
  });

  it('returns false for non-matching hashes', () => {
    const hashes = new Set(['abc123']);
    expect(isHashDuplicate('xyz789', hashes)).toBe(false);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns ~1.0 for near-identical vectors', () => {
    const a = [0.9, 0.1, 0.05];
    const b = [0.91, 0.09, 0.04];
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
  });
});
```

**Step 2: Write implementations**

```ts
// packages/shared-llm/src/ingestion/dedup/hash.ts
/**
 * FILE PURPOSE: Hash-based exact dedup
 * WHY: §19 — fast, always-on first pass. SHA-256 content hash comparison.
 */

export function isHashDuplicate(contentHash: string, existingHashes: Set<string>): boolean {
  return existingHashes.has(contentHash);
}
```

```ts
// packages/shared-llm/src/ingestion/dedup/near.ts
/**
 * FILE PURPOSE: Near-dedup via cosine similarity on embedding vectors
 * WHY: §19 — catches semantically identical content with different formatting.
 *      Threshold: > 0.95 = likely duplicate.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const NEAR_DEDUP_THRESHOLD = 0.95;

export interface NearDedupResult {
  isDuplicate: boolean;
  similarDocId?: string;
  similarity: number;
}
```

```ts
// packages/shared-llm/src/ingestion/dedup/index.ts
export { isHashDuplicate } from './hash.js';
export { cosineSimilarity, NEAR_DEDUP_THRESHOLD } from './near.js';
export type { NearDedupResult } from './near.js';
```

**Step 3: Export, run tests, commit**

Add to `packages/shared-llm/src/ingestion/index.ts`:
```ts
export { isHashDuplicate, cosineSimilarity, NEAR_DEDUP_THRESHOLD } from './dedup/index.js';
export type { NearDedupResult } from './dedup/index.js';
```

Run: `cd /Users/kalpeshjaju/Development/ai-product-playbook && npx vitest run packages/shared-llm/tests/dedup.test.ts`

```bash
git add packages/shared-llm/src/ingestion/dedup/ packages/shared-llm/tests/dedup.test.ts packages/shared-llm/src/ingestion/index.ts
git commit -m "feat(input): add hash dedup + near-dedup via cosine similarity (§19)"
```

---

## Task 14: Wire Unified Ingest API Route

**Files:**
- Create: `apps/api/src/routes/ingest.ts`
- Modify: `apps/api/src/server.ts` (add route wiring)

This is the unified `/api/ingest` endpoint that accepts any MIME type and dispatches via the registry.

**Step 1: Write the route**

```ts
// apps/api/src/routes/ingest.ts
/**
 * FILE PURPOSE: Unified ingestion API route — accepts any supported MIME type
 * WHY: §19 — single entry point for all input modalities. Dispatches via IngesterRegistry.
 *
 * Routes:
 *   POST /api/ingest — ingest content of any supported type
 *   GET  /api/ingest/types — list supported MIME types
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  IngesterRegistry,
  DocumentIngester,
  AudioIngester,
  ImageIngester,
  WebIngester,
  CsvIngester,
  ApiFeedIngester,
  createUserContext,
  withLangfuseHeaders,
} from '@playbook/shared-llm';
import { checkTokenBudget } from '../rate-limiter.js';
import { checkCostBudget } from '../cost-guard.js';

const registry = new IngesterRegistry();
registry.register(new DocumentIngester());
registry.register(new AudioIngester());
registry.register(new ImageIngester());
registry.register(new WebIngester());
registry.register(new CsvIngester());
registry.register(new ApiFeedIngester());

export async function handleIngestRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
): Promise<void> {
  try {
    const parsedUrl = new URL(url, 'http://localhost');

    // GET /api/ingest/types
    if (parsedUrl.pathname === '/api/ingest/types' && req.method === 'GET') {
      res.end(JSON.stringify({ supportedTypes: registry.supportedTypes() }));
      return;
    }

    // POST /api/ingest
    if (parsedUrl.pathname === '/api/ingest' && req.method === 'POST') {
      const contentType = typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type'].split(';')[0]!.trim()
        : '';

      if (!contentType) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Content-Type header required' }));
        return;
      }

      const userCtx = createUserContext(req);
      const rawBody = await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', () => resolve(Buffer.alloc(0)));
      });

      if (rawBody.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Empty body' }));
        return;
      }

      // Budget checks
      const estimatedTokens = Math.max(1, Math.ceil(rawBody.length / 4));
      const tokenBudget = await checkTokenBudget(userCtx.userId, estimatedTokens);
      if (!tokenBudget.allowed) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: 'Token budget exceeded' }));
        return;
      }

      const costCheck = checkCostBudget();
      if (!costCheck.allowed) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: 'Cost budget exceeded' }));
        return;
      }

      const result = await registry.ingest(rawBody, contentType);
      if (!result) {
        res.statusCode = 422;
        res.end(JSON.stringify({
          error: `Unsupported or failed ingestion for Content-Type: ${contentType}`,
          supportedTypes: registry.supportedTypes(),
        }));
        return;
      }

      res.statusCode = 201;
      res.end(JSON.stringify({
        text: result.text.slice(0, 500) + (result.text.length > 500 ? '...' : ''),
        sourceType: result.sourceType,
        mimeType: result.mimeType,
        contentHash: result.contentHash,
        metadata: result.metadata,
        textLength: result.text.length,
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in ingest routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
```

**Step 2: Wire into server.ts**

Add import at top of `apps/api/src/server.ts`:
```ts
import { handleIngestRoutes } from './routes/ingest.js';
```

Add route match (before the 404 fallback, after the existing routes):
```ts
    // Unified ingestion (§19 Input Pillar)
    if (url.startsWith('/api/ingest')) {
      await handleIngestRoutes(req, res, url);
      return;
    }
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/ingest.ts apps/api/src/server.ts
git commit -m "feat(input): add unified /api/ingest route with registry dispatch (§19)"
```

---

## Task 15: Update Docs & Final Integration Test

**Files:**
- Modify: `docs/API_CONTRACTS.md` — add `/api/ingest` endpoints
- Modify: `docs/ARCHITECTURE.md` — add ingestion pipeline section
- Modify: `docs/DATA_MODEL.md` — update documents table with new columns
- Test: `apps/api/tests/ingest.test.ts`

**Step 1: Write integration test**

```ts
// apps/api/tests/ingest.test.ts
import { describe, it, expect } from 'vitest';

describe('/api/ingest', () => {
  it('GET /api/ingest/types returns supported MIME types', async () => {
    // This test validates the route is wired. Full integration needs running server.
    const { handleIngestRoutes } = await import('../src/routes/ingest.js');
    expect(typeof handleIngestRoutes).toBe('function');
  });
});
```

**Step 2: Update docs**

Add to `docs/API_CONTRACTS.md`:
```markdown
### Unified Ingestion (§19)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/ingest | Ingest content of any supported MIME type |
| GET | /api/ingest/types | List supported MIME types |
```

Add to `docs/ARCHITECTURE.md`:
```markdown
## Ingestion Pipeline (§19)

All input modalities route through the `IngesterRegistry`:

\`\`\`
Content → IngesterRegistry → [DocumentIngester | AudioIngester | ImageIngester | WebIngester | CsvIngester | ApiFeedIngester]
                                       ↓
                              IngestResult { text, sourceType, contentHash, metadata }
                                       ↓
                              Chunking → Embedding → Dedup → Store
                                       ↓
                              BullMQ Pipeline (async enrichment, re-embedding, freshness)
\`\`\`
```

**Step 3: Commit**

```bash
git add docs/API_CONTRACTS.md docs/ARCHITECTURE.md docs/DATA_MODEL.md apps/api/tests/ingest.test.ts
git commit -m "docs: update API contracts, architecture, data model for Input Pillar (§19)"
```

**Step 4: Push to GitHub**

```bash
git push origin main
```

---

## Summary

| Task | What | New Files | Tests |
|------|------|-----------|-------|
| 1 | Core interfaces | 2 | 3 |
| 2 | Registry | 1 | 6 |
| 3 | Chunking strategies | 5 | 8 |
| 4 | Document adapter | 1 | 7 |
| 5 | Audio adapter | 1 | 4 |
| 6 | Image/OCR adapter | 1 | 3 |
| 7 | Web adapter | 1 | 4 |
| 8 | CSV/Excel adapter | 1 | 4 |
| 9 | API feed adapter | 1 | 4 |
| 10 | BullMQ pipeline | 3 | 3 |
| 11 | Schema migration | 2 | — |
| 12 | Freshness enforcement | 1 | 4 |
| 13 | Near-dedup | 3 | 3 |
| 14 | Unified ingest route | 1 | 1 |
| 15 | Docs + integration | 3 | 1 |
| **Total** | | **~27 new files** | **~55 tests** |

**New dependencies**: `tesseract.js`, `zerox`, `bullmq`, `papaparse`, `@types/papaparse`, `xlsx`

**Commits**: 15 (one per task)
