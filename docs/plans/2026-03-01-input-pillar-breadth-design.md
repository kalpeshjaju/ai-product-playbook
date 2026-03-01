# Input Pillar — Full Breadth Build-out Design

> **Date**: 2026-03-01
> **Owner**: Kalpesh Jaju
> **Status**: Approved
> **Playbook Section**: §19 (Data Ingestion & Living Inputs)

## Context

The Input Pillar is ~40% complete. The core happy path works (text/PDF/DOCX parsing, voice transcription, fixed chunking, hash dedup, embedding with model tagging, semantic search). The remaining ~60% covers: image/OCR, web scraping, CSV/Excel, API feeds, real-time streams, semantic chunking, entity dedup, enrichment pipeline, freshness enforcement, re-embedding, raw source storage, and observability.

### Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy | Full breadth coverage | Scaffold all modalities with consistent interfaces, deepen later |
| Architecture | Interface-first adapter pattern | Extends existing parseDocument/transcribeAudio patterns. Ships incrementally. |
| Image/OCR | Tesseract (simple) + Zerox (complex) tiered | Cost-optimized: free local OCR for simple text, vision LLM for complex/scanned |
| Web scraping | Firecrawl | Managed API, JS rendering, clean markdown. $16/mo. Minimal code. |
| Job queue | BullMQ | Node.js native, uses existing Railway Redis. Free. Playbook default pick. |

## Design

### 1. Core Interface & Adapter Pattern

Every input modality produces the same result shape.

```ts
// packages/shared-llm/src/ingestion/types.ts

interface IngestResult {
  text: string;                        // Extracted text content
  sourceType: string;                  // 'document' | 'image' | 'web' | 'csv' | 'api' | 'audio' | 'stream'
  mimeType: string;                    // Original MIME type
  contentHash: string;                 // SHA-256 of extracted text
  metadata: Record<string, unknown>;   // Modality-specific metadata
  rawSource?: Buffer;                  // Original file for re-processing
}

interface IngestOptions {
  chunkStrategy?: ChunkStrategy;
  modelId?: string;                    // Embedding model override
  validUntil?: Date;                   // Freshness expiry
  metadata?: Record<string, unknown>;  // Additional context
}

interface Ingester {
  canHandle(mimeType: string): boolean;
  ingest(content: Buffer, options?: IngestOptions): Promise<IngestResult | null>;
}
```

An `IngesterRegistry` dispatches to the right adapter based on MIME type. Existing `parseDocument()` and `transcribeAudio()` become adapters conforming to this interface.

**New adapters (6)**:
1. `ImageIngester` — Tesseract for simple images, Zerox for complex/scanned
2. `WebIngester` — Firecrawl API
3. `CsvIngester` — Papa Parse (CSV) + SheetJS (Excel)
4. `ApiIngester` — Generic HTTP fetcher with auth/retry
5. `StreamIngester` — BullMQ consumer for webhooks/events
6. Refactor existing `DocumentIngester` + `AudioIngester` into adapter pattern

**File structure**:
```
packages/shared-llm/src/ingestion/
├── types.ts              # IngestResult, Ingester, IngestOptions
├── registry.ts           # IngesterRegistry — dispatches by MIME type
├── adapters/
│   ├── document.ts       # Refactored from parsing/document-parser.ts
│   ├── audio.ts          # Refactored from transcription/deepgram.ts
│   ├── image.ts          # Tesseract + Zerox tiered
│   ├── web.ts            # Firecrawl
│   ├── csv.ts            # Papa Parse + SheetJS
│   ├── api-feed.ts       # Generic HTTP with auth/retry
│   └── stream.ts         # BullMQ consumer adapter
├── chunking/
│   ├── types.ts          # ChunkStrategy type
│   ├── fixed.ts          # Current chunker (extracted from documents.ts)
│   ├── semantic.ts       # LLM-based boundary detection
│   ├── sliding-window.ts # Overlap-based chunker
│   └── per-entity.ts     # One record = one chunk
├── dedup/
│   ├── hash.ts           # Existing SHA-256 dedup (extracted)
│   ├── near.ts           # Cosine similarity > 0.95
│   └── entity.ts         # Key identifier matching via LLM
├── pipeline/
│   ├── queue.ts          # BullMQ queue setup
│   ├── workers.ts        # Job processors
│   └── jobs.ts           # Job type definitions
├── freshness.ts          # Freshness enforcement utilities
└── index.ts              # Public exports
```

### 2. Chunking Strategy Upgrade

Replace single fixed-size chunker with a strategy selector.

```ts
type ChunkStrategy = 'fixed' | 'semantic' | 'sliding-window' | 'per-entity';
```

| Strategy | When | Trade-off |
|----------|------|-----------|
| `fixed` (current default) | Blog posts, articles, uniform content | Splits mid-sentence. Fast, predictable. |
| `semantic` | Reports, manuals, legal docs | Better retrieval. Slower (needs LLM or NLP). |
| `sliding-window` | Transcripts, meeting notes, chat | Cross-boundary context. 2x storage. |
| `per-entity` | CSV rows, job listings, profiles | Simple. Breaks if entity > 8K tokens. |

Strategy selected per-request (default: `fixed`) or auto-detected from `sourceType`:
- `audio` → `sliding-window`
- `csv` → `per-entity`
- `document` (PDF/DOCX) → `fixed` (upgrade to `semantic` later)
- `web` → `fixed`
- `image` → `fixed`

### 3. Semantic & Entity Dedup

Layered on top of existing hash dedup:

1. **Hash dedup** (existing): Exact match on SHA-256. Fast, always runs first.
2. **Near dedup** (new): After embedding, cosine similarity > 0.95 against existing embeddings for same `sourceType`. Returns `{ isDuplicate: boolean, similarDocId?: string, similarity: number }`.
3. **Entity dedup** (new): Extract key identifiers (name + email, company + domain) via LLM, match against existing records. Runs as enrichment job. For structured entities only.

Near-dedup runs synchronously during ingestion (quick pgvector query). Entity-dedup is async via BullMQ.

### 4. BullMQ Enrichment Pipeline

Central async job queue using existing Railway Redis.

```
Queue: 'ingestion-pipeline'

Job types:
  embed         — Generate/regenerate embeddings for a document
  enrich        — Run enrichment graph (extract entities, link sources)
  dedup-check   — Near-dedup + entity-dedup against existing records
  re-embed      — Batch re-index when embedding model changes
  freshness     — Check valid_until, demote/remove stale docs
  scrape        — Firecrawl job for async URL ingestion

Worker config:
  concurrency: 5 (configurable via INGESTION_CONCURRENCY env)
  retries: 3 with exponential backoff
  job timeout: 60s (embed), 120s (enrich/scrape), 30s (dedup/freshness)
```

Each job is idempotent. Status tracked on `documents` table via new `enrichment_status` JSONB column:
```json
{
  "embedding": "success",
  "entity_dedup": "pending",
  "enrichment": "failed_retrying"
}
```

### 5. Voice Upgrades

Enhance existing Deepgram wrapper:
- Add `diarize: true` to request params → returns `words[].speaker` per segment
- Add `keywords` param → custom vocabulary list (env var `DEEPGRAM_KEYWORDS` or per-request)
- Extract per-word confidence from Deepgram response `words[].confidence` (data already returned, just not captured)
- Return `speakers: Array<{ id: number; segments: Array<{ text, start, end, confidence }> }>` in `TranscriptionResult`
- Wrap into `AudioIngester` adapter conforming to `IngestResult`

### 6. Freshness Enforcement

Three changes:
1. **Query filter**: Add `WHERE valid_until IS NULL OR valid_until > NOW()` to embedding search in `embeddings.ts`
2. **Staleness demotion**: Multiply similarity score by freshness factor:
   - `ingested_at` < 30d → 1.0
   - `ingested_at` 30-90d → 0.9
   - `ingested_at` > 90d → 0.8
3. **BullMQ cron job**: Daily freshness scan. Logs stale document count to PostHog. Writes summary to Langfuse.

### 7. Raw Source Storage

Schema change on `documents` table:
- Add `raw_content bytea` — stores original file for docs < 5MB
- Add `raw_content_url text` — S3/R2 URL for larger files (deferred until needed)

For breadth scaffolding: store raw content inline (most documents are < 5MB). Add the column, populate on ingestion. Enables re-chunking and re-embedding without re-fetching source material.

### 8. Observability

| Metric | Where Logged | Frequency |
|--------|-------------|-----------|
| Dedup rate (hash + near) | Langfuse custom event | Per ingestion |
| Ingestion throughput (docs/min) | PostHog | Per ingestion |
| Enrichment queue depth | PostHog + Langfuse | Every 5 min (BullMQ event) |
| Enrichment failure rate | Sentry + Langfuse | Per failure |
| Freshness report | PostHog | Daily cron |
| Embedding model distribution | Langfuse | Per search |

### 9. Schema Changes Summary

```sql
-- documents table additions
ALTER TABLE documents ADD COLUMN raw_content bytea;
ALTER TABLE documents ADD COLUMN raw_content_url text;
ALTER TABLE documents ADD COLUMN chunk_strategy text NOT NULL DEFAULT 'fixed';
ALTER TABLE documents ADD COLUMN enrichment_status jsonb DEFAULT '{}';
ALTER TABLE documents ADD COLUMN source_type text NOT NULL DEFAULT 'document';
```

### 10. New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `zerox` | Vision LLM OCR for complex documents | npm package |
| `tesseract.js` | Local OCR for simple images | ~10MB (WASM) |
| `bullmq` | Job queue on Redis | Lightweight |
| `papaparse` | CSV parsing | Lightweight |
| `xlsx` | Excel parsing | ~2MB |
| `@anthropic-ai/sdk` or via LiteLLM | Zerox vision model calls | Already available via LiteLLM |

Firecrawl: API calls only, no SDK dependency needed (REST API).

### 11. Implementation Order

The build sequence is designed so each step is independently testable and deployable:

1. **Core interfaces + registry** — types.ts, registry.ts, refactor existing adapters
2. **Chunking upgrade** — extract + add strategies, wire to documents route
3. **Raw source storage** — schema migration + store on ingestion
4. **BullMQ pipeline** — queue setup, embed worker, basic job types
5. **Image/OCR adapter** — Tesseract + Zerox tiered
6. **Web adapter** — Firecrawl integration
7. **CSV/Excel adapter** — Papa Parse + SheetJS
8. **Voice upgrades** — diarization, vocabulary, per-word confidence
9. **Dedup upgrades** — near-dedup + entity-dedup
10. **Freshness enforcement** — query filter + staleness demotion + cron
11. **API feed + stream adapters** — generic HTTP + BullMQ consumer
12. **Observability** — metrics, reports, dashboards

## Not In Scope

- Multi-tenant isolation (future, after Nango integration)
- Object storage for large files (use inline `raw_content` for now)
- Kafka/Redpanda (BullMQ sufficient for current scale)
- Image understanding via GPT-4o/Claude vision for chart interpretation (Zerox handles text extraction only)
