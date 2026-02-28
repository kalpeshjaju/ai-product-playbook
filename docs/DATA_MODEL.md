# Data Model

> Database schema documentation. Source of truth: `apps/api/src/db/schema.ts`
> ORM: Drizzle (PostgreSQL). Run `npm run db:push` to sync.

## Tables

### 1. `prompt_versions`

Tracks every prompt version with traffic allocation for A/B testing.
Promotion flow: 0% → 10% → 50% → 100% (§22).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, auto-random | Unique identifier |
| `prompt_name` | `text` | NOT NULL | Logical prompt identifier (e.g., `job-classifier`) |
| `version` | `text` | NOT NULL | Semver string (e.g., `v1.2.0`) |
| `content` | `text` | NOT NULL | Full prompt template |
| `content_hash` | `text` | NOT NULL | SHA-256 hash of content |
| `eval_score` | `numeric(3,2)` | nullable | Braintrust eval score (0.00–1.00) |
| `active_pct` | `integer` | NOT NULL, default 0 | Traffic allocation percentage (0–100) |
| `author` | `text` | NOT NULL | Who created this version |
| `created_at` | `timestamptz` | NOT NULL, default now() | Creation timestamp |

**Indexes:**
- `uq_prompt_name_version` — UNIQUE on `(prompt_name, version)`

**Promotion flow:**
1. Created at `active_pct = 0` (no traffic)
2. Promoted to 10% (canary)
3. Requires `eval_score >= 0.70` to promote beyond 10%
4. Promoted to 50% (staged rollout)
5. Promoted to 100% (full rollout — all other versions set to 0%)

---

### 2. `ai_generations`

Every LLM generation logged for quality tracking, cost analysis, and debugging.
Implements Playbook §21 Plane 3 schema with 4 column groups.

| Column | Type | Constraints | Group | Description |
|--------|------|-------------|-------|-------------|
| `id` | `uuid` | PK, auto-random | — | Unique identifier |
| `created_at` | `timestamptz` | NOT NULL, default now() | — | Generation timestamp |
| `user_id` | `text` | NOT NULL | WHO | User identifier |
| `session_id` | `text` | nullable | WHO | Session grouping |
| `prompt_hash` | `text` | NOT NULL | WHAT ASKED | Hash of prompt sent |
| `prompt_version` | `text` | NOT NULL | WHAT ASKED | Version of prompt used |
| `task_type` | `text` | NOT NULL | WHAT ASKED | Task category (classification, extraction, scoring) |
| `input_tokens` | `integer` | NOT NULL | WHAT ASKED | Input token count |
| `response_hash` | `text` | NOT NULL | RETURNED | Hash of LLM response |
| `output_tokens` | `integer` | NOT NULL | RETURNED | Output token count |
| `model` | `text` | NOT NULL | RETURNED | Model used (e.g., `claude-haiku`) |
| `model_version` | `text` | NOT NULL | RETURNED | Specific model version |
| `latency_ms` | `integer` | NOT NULL | RETURNED | End-to-end latency |
| `cost_usd` | `numeric(10,6)` | NOT NULL | RETURNED | Cost of this generation |
| `user_feedback` | `text` | nullable | QUALITY | One of: accepted, rejected, edited, regenerated, ignored |
| `feedback_at` | `timestamptz` | nullable | QUALITY | When feedback was given |
| `thumbs` | `smallint` | nullable | QUALITY | -1, 0, or 1 |
| `user_edit_diff` | `text` | nullable | QUALITY | Diff if user edited output |
| `quality_score` | `numeric(3,2)` | nullable | QUALITY | Automated quality score |
| `hallucination` | `boolean` | default false | QUALITY | Hallucination flag |
| `guardrail_triggered` | `text[]` | nullable | QUALITY | Array of triggered guardrail names |

**Indexes:**
- `idx_ai_gen_user` — `(user_id, created_at)` — user activity queries
- `idx_ai_gen_quality` — `(created_at, quality_score)` — quality trend analysis
- `idx_ai_gen_prompt` — `(prompt_version, quality_score)` — prompt A/B comparison
- `idx_ai_gen_model` — `(model, hallucination)` — model reliability tracking

---

### 3. `embeddings`

Vector embeddings with model_id tagging (§19 HARD GATE).
Uses pgvector extension with HNSW index for approximate nearest-neighbor search.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, auto-random | Unique identifier |
| `source_type` | `text` | NOT NULL | Entity type (e.g., `job_posting`, `resume`) |
| `source_id` | `text` | NOT NULL | ID of source entity |
| `content_hash` | `text` | NOT NULL | Hash of embedded content |
| `embedding` | `vector(1536)` | NOT NULL | 1536-dim embedding vector |
| `model_id` | `text` | NOT NULL | Model that generated this embedding (HARD GATE) |
| `metadata` | `jsonb` | nullable | Additional context |
| `created_at` | `timestamptz` | NOT NULL, default now() | Creation timestamp |

**Indexes:**
- HNSW index (manual creation required):
  ```sql
  CREATE INDEX idx_embeddings_hnsw ON embeddings
    USING hnsw (embedding vector_cosine_ops);
  ```

**model_id tagging (§19):**
Embeddings from different models are incomparable. The `model_id` column ensures
queries only compare embeddings from the same model. This is a HARD GATE —
every embedding must have its model tagged.

---

## Deferred Tables

Per §20 Layer Investment Sequencing (Month 3–6+):
- `user_preferences` — User profile and preference storage
- `match_quality_signals` — Match quality feedback loop
- `outcomes` — Hiring outcome tracking
